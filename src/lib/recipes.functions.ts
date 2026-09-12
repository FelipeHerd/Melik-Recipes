import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/require-auth";
import {
  parseIngredients,
  parseSteps,
  serializeIngredients,
  serializeSteps,
  type Ingredient,
  type Step,
} from "@/lib/recipe-format";

const IMAGE_BUCKET = "recipe-images";
// 7 days — refreshed on every listRecipes call (queries refetch on staleTime).
const SIGNED_URL_TTL = 60 * 60 * 24 * 7;
// Pre-generated at upload time (local disk has no live transform API) —
// see uploadRecipeImage. Cover thumbnails for list views, step thumbnails
// for the recipe-detail modal/lightbox.
const COVER_THUMB = { width: 640, height: 400, quality: 70 };
const STEP_THUMB = { width: 800, height: 800, quality: 75 };

const ingredientSchema = z.object({
  quantity: z.string().max(32).default(""),
  unit: z.string().max(16).default(""),
  name: z.string().max(200).default(""),
});

const stepSchema = z.object({
  text: z.string().max(1000).default(""),
  imagePath: z.string().max(500).nullable().optional().default(null),
});

const recipeInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  ingredients: z.array(ingredientSchema).max(20).default([]),
  instructions: z.array(stepSchema).max(20).default([]),
  category: z.string().max(80).default("Otro"),
  timeMinutes: z.number().int().min(0).max(10000).default(0),
  emoji: z.string().max(8).default("🍽️"),
  notes: z.string().max(5000).optional().default(""),
  imagePath: z.string().max(500).nullable().optional().default(null),
  isBakerMode: z.boolean().optional(),
  isDraft: z.boolean().optional(),
  isPublic: z.boolean().optional(),
  // Admin-only flags. A non-admin request that includes these is silently
  // dropped by rowToDbColumns below — we still gate them here so an admin's
  // request is honoured cleanly and a regular user's request never even
  // sends the column.
  isOfficialMelik: z.boolean().optional(),
  isPremiumOnly: z.boolean().optional(),
});

export type RecipeInput = z.infer<typeof recipeInputSchema>;

// Vacuna #1 — Server-side paywall enforcement.
// If a NON-premium user tries to set isPublic=false (make private), we force
// it back to true. Never trust the client flag.
async function enforcePublicFlag(userId: string, requested: boolean | undefined): Promise<boolean | undefined> {
  if (requested !== false) return requested;
  const { db } = await import("@/lib/db.server");
  const row = await db.selectFrom("profiles").select(["is_premium"]).where("id", "=", userId).executeTakeFirst();
  return row?.is_premium ? false : true;
}

function rowToDbColumns(data: RecipeInput, opts?: { admin?: boolean }) {
  const ingredients = data.ingredients.filter((i) => i.name || i.quantity || i.unit);
  const instructions = data.instructions.filter((s) => s.text || s.imagePath);
  const cols = {
    title: data.title,
    category: data.category,
    emoji: data.emoji,
    time_minutes: data.timeMinutes,
    notes: data.notes,
    image_url: data.imagePath ?? null,
    // node-postgres doesn't auto-serialize JS values for jsonb columns —
    // see toJsonb's comment in db.server.ts. Inlined here (rather than
    // importing that helper) since this is a plain sync function shared by
    // both client-bundled *.functions.ts call sites and server handlers.
    ingredients_json: JSON.stringify(ingredients),
    instructions_json: JSON.stringify(instructions),
    ingredients: serializeIngredients(ingredients),
    instructions: serializeSteps(instructions),
    is_baker_mode: !!data.isBakerMode,
    ...(typeof data.isDraft === "boolean" ? { is_draft: data.isDraft } : {}),
    ...(typeof data.isPublic === "boolean" ? { is_public: data.isPublic } : {}),
    // Admin flags only forwarded when the caller is verified as admin/dev.
    ...(opts?.admin && typeof data.isOfficialMelik === "boolean"
      ? { is_official_melik: data.isOfficialMelik }
      : {}),
    ...(opts?.admin && typeof data.isPremiumOnly === "boolean"
      ? { is_premium_only: data.isPremiumOnly }
      : {}),
  };
  return cols;
}

async function signMany(paths: string[]): Promise<Map<string, string>> {
  const { signPaths } = await import("@/lib/storage/signed-url.server");
  const unique = Array.from(new Set(paths.filter(Boolean)));
  return signPaths(IMAGE_BUCKET, unique, SIGNED_URL_TTL);
}

// Signs the pre-generated thumbnail for each path when present, falling back
// to the full-size original otherwise (e.g. records uploaded before the
// thumbnail pipeline existed). Replaces Supabase Storage's on-the-fly
// createSignedUrl(..., { transform }).
async function signManyThumbnails(
  paths: string[],
  preset: { width: number; height: number; quality: number },
): Promise<Map<string, string>> {
  const { signPath } = await import("@/lib/storage/signed-url.server");
  const { fileExists } = await import("@/lib/storage/local-storage.server");
  const { thumbnailPath } = await import("@/lib/storage/thumbnail.server");
  const map = new Map<string, string>();
  const unique = Array.from(new Set(paths.filter(Boolean)));
  await Promise.all(
    unique.map(async (p) => {
      const thumb = thumbnailPath(p, preset);
      const hasThumb = await fileExists(IMAGE_BUCKET, thumb);
      map.set(p, signPath(IMAGE_BUCKET, hasThumb ? thumb : p, SIGNED_URL_TTL));
    }),
  );
  return map;
}

type RecipeRow = {
  id: string;
  title: string;
  category: string | null;
  emoji: string | null;
  time_minutes: number | null;
  ingredients: string | null;
  instructions: string | null;
  ingredients_json: unknown;
  instructions_json: unknown;
  notes: string | null;
  created_at: Date;
  image_url: string | null;
  is_baker_mode?: boolean | null;
  is_draft?: boolean | null;
  is_public?: boolean | null;
  original_author?: string | null;
};

function shapeRow(row: RecipeRow, signedByPath: Map<string, string>) {
  const ingredients: Ingredient[] =
    row.ingredients_json != null ? parseIngredients(row.ingredients_json) : parseIngredients(row.ingredients);
  const stepsRaw: Step[] =
    row.instructions_json != null ? parseSteps(row.instructions_json) : parseSteps(row.instructions);
  const instructions: Step[] = stepsRaw.map((s) => ({
    text: s.text,
    imagePath: s.imagePath ?? null,
    imageUrl: s.imagePath ? signedByPath.get(s.imagePath) ?? null : null,
  }));
  return {
    id: row.id,
    title: row.title,
    ingredients,
    instructions,
    category: row.category ?? "Otro",
    timeMinutes: row.time_minutes ?? 0,
    emoji: row.emoji ?? "🍽️",
    createdAt: new Date(row.created_at).getTime(),
    imagePath: row.image_url ?? null,
    imageUrl: row.image_url ? signedByPath.get(row.image_url) ?? null : null,
    isBakerMode: !!row.is_baker_mode,
    isDraft: !!row.is_draft,
    isPublic: row.is_public ?? true,
    originalAuthor: row.original_author ?? null,
  };
}

export type RecipesPage = {
  items: Awaited<ReturnType<typeof shapeRow>>[];
  nextCursor: string | null;
};

const listInputSchema = z
  .object({
    cursor: z.string().datetime().nullable().optional(),
    limit: z.number().int().min(1).max(50).optional(),
  })
  .optional();

const RECIPE_LIST_COLUMNS = [
  "id",
  "title",
  "category",
  "emoji",
  "time_minutes",
  "ingredients",
  "instructions",
  "ingredients_json",
  "instructions_json",
  "notes",
  "created_at",
  "image_url",
  "is_public",
  "original_author",
] as const;

// Pilar 4: paginación keyset por `created_at` descendente.
export const listRecipes = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => listInputSchema.parse(input) ?? {})
  .handler(async ({ data, context }): Promise<RecipesPage> => {
    const { db } = await import("@/lib/db.server");
    const limit = data?.limit ?? 12;
    const cursor = data?.cursor ?? null;
    let q = db
      .selectFrom("recipes")
      .select(RECIPE_LIST_COLUMNS)
      .where("user_id", "=", context.userId)
      .where("is_draft", "=", false)
      .orderBy("created_at", "desc")
      .limit(limit + 1);
    if (cursor) q = q.where("created_at", "<", new Date(cursor));
    const rows = (await q.execute()) as unknown as RecipeRow[];

    const hasMore = rows.length > limit;
    const trimmed = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? new Date(trimmed[trimmed.length - 1].created_at).toISOString() : null;

    // Listado: portadas con thumbnail (640×400 q70) e imágenes de pasos con
    // preset intermedio (800×800 q75). El original de 3-5 MB se reduce a
    // decenas de KB manteniendo nitidez suficiente para el modal + lightbox.
    const coverPaths: string[] = [];
    const stepPaths: string[] = [];
    for (const r of trimmed) {
      if (r.image_url) coverPaths.push(r.image_url);
      const steps = r.instructions_json != null ? parseSteps(r.instructions_json) : parseSteps(r.instructions);
      for (const s of steps) if (s.imagePath) stepPaths.push(s.imagePath);
    }
    const [coverMap, stepMap] = await Promise.all([
      signManyThumbnails(coverPaths, COVER_THUMB),
      signManyThumbnails(stepPaths, STEP_THUMB),
    ]);
    const signedByPath = new Map<string, string>([...coverMap, ...stepMap]);
    return { items: trimmed.map((r) => shapeRow(r, signedByPath)), nextCursor };
  });

export const createRecipe = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: RecipeInput) => recipeInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { db } = await import("@/lib/db.server");
    // Vacuna #1: enforce paywall server-side before insert.
    const safeIsPublic = await enforcePublicFlag(context.userId, data.isPublic);
    // Admin flags require admin/dev role. rowToDbColumns also gates this,
    // but we check at the JS layer so a non-admin never sees a silent no-op.
    let admin = false;
    if (data.isOfficialMelik === true || data.isPremiumOnly === true) {
      const { isAdmin } = await import("@/lib/auth/authorize.server");
      admin = await isAdmin(context.userId);
      if (!admin) throw new Error("APP-PERM-002: admin required");
    }
    const cols = rowToDbColumns({ ...data, isPublic: safeIsPublic }, { admin });
    const row = await db
      .insertInto("recipes")
      .values({ user_id: context.userId, ...cols })
      .returning(["id", "created_at"])
      .executeTakeFirstOrThrow();
    return { id: row.id, createdAt: new Date(row.created_at).getTime() };
  });

const updateInputSchema = recipeInputSchema.extend({
  id: z.string().uuid(),
  removedImagePaths: z.array(z.string().max(500)).max(40).optional().default([]),
});

export const updateRecipe = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: z.infer<typeof updateInputSchema>) => updateInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { db } = await import("@/lib/db.server");
    const { id, removedImagePaths, ...rest } = data;
    const safeIsPublic = await enforcePublicFlag(context.userId, rest.isPublic);
    let admin = false;
    if (rest.isOfficialMelik === true || rest.isPremiumOnly === true) {
      const { isAdmin } = await import("@/lib/auth/authorize.server");
      admin = await isAdmin(context.userId);
      if (!admin) throw new Error("APP-PERM-002: admin required");
    } else if (typeof rest.isOfficialMelik === "boolean" || typeof rest.isPremiumOnly === "boolean") {
      // Admin editing existing official recipe may need to *clear* a flag.
      const { isAdmin } = await import("@/lib/auth/authorize.server");
      admin = await isAdmin(context.userId);
    }
    const cols = rowToDbColumns({ ...rest, isPublic: safeIsPublic }, { admin });
    // Admins may edit any (official) recipe by id; regular users are
    // restricted to their own rows — this replaces what Supabase RLS used
    // to enforce via the "own row" UPDATE policy.
    let query = db.updateTable("recipes").set(cols).where("id", "=", id);
    if (!admin) query = query.where("user_id", "=", context.userId);
    await query.execute();

    if (removedImagePaths.length > 0) {
      const { deleteFile } = await import("@/lib/storage/local-storage.server");
      const own = removedImagePaths.filter((p) => p.startsWith(`${context.userId}/`));
      await Promise.all(own.map((p) => deleteFile(IMAGE_BUCKET, p)));
    }
    return { ok: true };
  });

export const deleteRecipe = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { db } = await import("@/lib/db.server");
    const row = await db
      .selectFrom("recipes")
      .select(["image_url", "instructions_json"])
      .where("id", "=", data.id)
      .where("user_id", "=", context.userId)
      .executeTakeFirst();
    const toRemove: string[] = [];
    if (row?.image_url) toRemove.push(row.image_url);
    if (row?.instructions_json) {
      for (const s of parseSteps(row.instructions_json)) if (s.imagePath) toRemove.push(s.imagePath);
    }
    if (toRemove.length > 0) {
      const { deleteFile } = await import("@/lib/storage/local-storage.server");
      const own = toRemove.filter((p) => p.startsWith(`${context.userId}/`));
      await Promise.all(own.map((p) => deleteFile(IMAGE_BUCKET, p)));
    }
    await db.deleteFrom("recipes").where("id", "=", data.id).where("user_id", "=", context.userId).execute();
    return { ok: true };
  });

export const migrateGuestRecipes = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: { recipes: RecipeInput[] }) =>
    z.object({ recipes: z.array(recipeInputSchema).max(500) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    if (data.recipes.length === 0) return { inserted: 0 };
    const { db } = await import("@/lib/db.server");
    const rows = data.recipes.map((r) => ({ user_id: context.userId, ...rowToDbColumns(r) }));
    await db.insertInto("recipes").values(rows).execute();
    return { inserted: rows.length };
  });

const importRowSchema = z.object({
  title: z.string().trim().min(1).max(200),
  category: z.string().max(80).default("Otro"),
  timeMinutes: z.number().int().min(0).max(10000).default(0),
  ingredients: z.string().max(10000).default(""),
  instructions: z.string().max(20000).default(""),
  createdAt: z.string().datetime().optional(),
  originalAuthor: z
    .string()
    .regex(/^[a-z0-9_]{3,20}$/)
    .optional(),
});

export const importRecipes = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => z.object({ recipes: z.array(importRowSchema).max(500) }).parse(input))
  .handler(async ({ data, context }) => {
    if (data.recipes.length === 0) return { inserted: 0, skipped: 0 };
    const { db, toJsonb } = await import("@/lib/db.server");

    // Dedup against the caller's own existing recipes only.
    const existing = await db
      .selectFrom("recipes")
      .select(["title", "created_at"])
      .where("user_id", "=", context.userId)
      .execute();

    const seen = new Set<string>();
    for (const row of existing) {
      const iso = new Date(row.created_at).toISOString();
      seen.add(`${(row.title ?? "").toLowerCase()}__${iso}`);
    }

    type InsertRow = {
      user_id: string;
      title: string;
      category: string;
      emoji: string;
      time_minutes: number;
      ingredients: string;
      instructions: string;
      ingredients_json: string;
      instructions_json: string;
      notes: string;
      created_at: Date;
      is_public: boolean;
      original_author: string | null;
    };
    const toInsert: InsertRow[] = [];
    let skipped = 0;
    for (const r of data.recipes) {
      const created = r.createdAt ? new Date(r.createdAt) : new Date();
      const iso = created.toISOString();
      const key = `${r.title.toLowerCase()}__${iso}`;
      if (seen.has(key)) {
        skipped++;
        continue;
      }
      seen.add(key);
      const ingArr = parseIngredients(r.ingredients);
      const stepArr = parseSteps(r.instructions);
      toInsert.push({
        user_id: context.userId,
        title: r.title,
        category: r.category || "Otro",
        emoji: "🍽️",
        time_minutes: r.timeMinutes,
        ingredients: serializeIngredients(ingArr),
        instructions: serializeSteps(stepArr),
        ingredients_json: toJsonb(ingArr),
        instructions_json: toJsonb(stepArr),
        notes: "",
        created_at: created,
        // CSV imports are always private by default (never re-publish someone
        // else's recipe). original_author is preserved when present.
        is_public: false,
        original_author: r.originalAuthor ?? null,
      });
    }

    if (toInsert.length === 0) return { inserted: 0, skipped };
    await db.insertInto("recipes").values(toInsert).execute();
    return { inserted: toInsert.length, skipped };
  });

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

export const uploadRecipeImage = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => {
    if (!(input instanceof FormData)) throw new Error("APP-DATA-001: FormData expected");
    const file = input.get("file");
    if (!(file instanceof File)) throw new Error("APP-FILE-003: file missing");
    if (!ALLOWED_MIME.has(file.type)) throw new Error("APP-FILE-001: unsupported mime");
    if (file.size > MAX_IMAGE_BYTES) throw new Error("APP-FILE-002: >5MB");
    return { file };
  })
  .handler(async ({ data, context }) => {
    const { file } = data;
    const extFromName = file.name.split(".").pop()?.toLowerCase() ?? "";
    const extFromMime = file.type.split("/").pop() ?? "";
    const ext = /^[a-z0-9]{1,5}$/.test(extFromName) ? extFromName : extFromMime || "jpg";
    const path = `${context.userId}/${crypto.randomUUID()}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { saveFile } = await import("@/lib/storage/local-storage.server");
    const { signPath } = await import("@/lib/storage/signed-url.server");
    const { generateThumbnail, thumbnailPath } = await import("@/lib/storage/thumbnail.server");

    await saveFile(IMAGE_BUCKET, path, buffer);

    // Pre-generate both thumbnail presets — this endpoint doesn't know
    // whether the image will be used as a cover or a step image.
    await Promise.all(
      [COVER_THUMB, STEP_THUMB].map(async (preset) => {
        try {
          const thumb = await generateThumbnail(buffer, preset);
          await saveFile(IMAGE_BUCKET, thumbnailPath(path, preset), thumb);
        } catch (err) {
          console.error("[uploadRecipeImage] thumbnail generation failed:", err);
        }
      }),
    );

    const signedUrl = signPath(IMAGE_BUCKET, path, SIGNED_URL_TTL);
    return { path, signedUrl };
  });

export const getProfile = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { db, isoOrNull } = await import("@/lib/db.server");
    const data = await db
      .selectFrom("profiles")
      .select([
        "id",
        "first_name",
        "last_name",
        "avatar_url",
        "is_premium",
        "username",
        "role",
        "kiko_blocked_until",
        "premium_until",
        "subscription_status",
      ])
      .where("id", "=", context.userId)
      .executeTakeFirst();
    if (!data) {
      return {
        id: context.userId,
        first_name: null,
        last_name: null,
        avatar_url: null,
        is_premium: false,
        username: null,
        role: "user",
        kiko_blocked_until: null,
        premium_until: null,
        subscription_status: "inactive",
      };
    }
    // node-postgres returns timestamptz columns as JS Date objects, but the
    // client (profile.tsx, melik-plus.functions.ts) expects the ISO-string
    // wire format Supabase/PostgREST used to send.
    return {
      ...data,
      kiko_blocked_until: isoOrNull(data.kiko_blocked_until),
      premium_until: isoOrNull(data.premium_until),
    };
  });

export const deleteAccount = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { deleteUserAccount } = await import("@/lib/auth/admin-users.server");
    await deleteUserAccount(context.userId);
    return { ok: true };
  });

// ---- Drafts ----

export const listDrafts = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<RecipesPage> => {
    const { db } = await import("@/lib/db.server");
    const rows = (await db
      .selectFrom("recipes")
      .select(RECIPE_LIST_COLUMNS)
      .where("user_id", "=", context.userId)
      .where("is_draft", "=", true)
      .orderBy("created_at", "desc")
      .limit(100)
      .execute()) as unknown as RecipeRow[];
    const paths: string[] = [];
    for (const r of rows) {
      if (r.image_url) paths.push(r.image_url);
      const steps = r.instructions_json != null ? parseSteps(r.instructions_json) : parseSteps(r.instructions);
      for (const s of steps) if (s.imagePath) paths.push(s.imagePath);
    }
    const signedByPath = await signMany(paths);
    return { items: rows.map((r) => shapeRow(r, signedByPath)), nextCursor: null };
  });

const saveDraftInputSchema = recipeInputSchema.extend({
  id: z.string().uuid().optional().nullable(),
});

export const saveDraft = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: z.infer<typeof saveDraftInputSchema>) => saveDraftInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { db } = await import("@/lib/db.server");
    const { id, ...rest } = data;
    const cols = rowToDbColumns({ ...rest, isDraft: true });
    if (id) {
      await db
        .updateTable("recipes")
        .set(cols)
        .where("id", "=", id)
        .where("user_id", "=", context.userId)
        .execute();
      return { id };
    }
    const row = await db
      .insertInto("recipes")
      .values({ user_id: context.userId, ...cols })
      .returning(["id"])
      .executeTakeFirstOrThrow();
    return { id: row.id };
  });

// ---- Admin Melik Catalog ----

export type AdminCatalogRow = {
  id: string;
  title: string;
  category: string;
  emoji: string;
  timeMinutes: number;
  imagePath: string | null;
  imageUrl: string | null;
  isDraft: boolean;
  isPremiumOnly: boolean;
  createdAt: number;
  ingredients: Ingredient[];
  instructions: Step[];
};

export const adminListOfficialRecipes = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<AdminCatalogRow[]> => {
    const { assertAdmin } = await import("@/lib/auth/authorize.server");
    await assertAdmin(context.userId);
    const { db } = await import("@/lib/db.server");
    const rows = await db
      .selectFrom("recipes")
      .select([
        "id",
        "title",
        "category",
        "emoji",
        "time_minutes",
        "image_url",
        "ingredients",
        "instructions",
        "ingredients_json",
        "instructions_json",
        "is_draft",
        "is_premium_only",
        "created_at",
      ])
      .where("is_official_melik", "=", true)
      .orderBy("created_at", "desc")
      .limit(200)
      .execute();

    const paths = rows.map((r) => r.image_url).filter((p): p is string => !!p);
    const signedByPath = await signMany(paths);

    return rows.map((r) => {
      const ingredients =
        r.ingredients_json != null ? parseIngredients(r.ingredients_json) : parseIngredients(r.ingredients);
      const stepsRaw = r.instructions_json != null ? parseSteps(r.instructions_json) : parseSteps(r.instructions);
      return {
        id: r.id,
        title: r.title,
        category: r.category ?? "Otro",
        emoji: r.emoji ?? "🍽️",
        timeMinutes: r.time_minutes ?? 0,
        imagePath: r.image_url ?? null,
        imageUrl: r.image_url ? signedByPath.get(r.image_url) ?? null : null,
        isDraft: !!r.is_draft,
        isPremiumOnly: !!r.is_premium_only,
        createdAt: new Date(r.created_at).getTime(),
        ingredients,
        instructions: stepsRaw.map((s) => ({
          text: s.text,
          imagePath: s.imagePath ?? null,
          imageUrl: s.imagePath ? signedByPath.get(s.imagePath) ?? null : null,
        })),
      };
    });
  });

export async function broadcastOfficialRecipeNotification(
  recipeId: string,
  recipeTitle: string,
): Promise<{ success: boolean; recipientCount: number }> {
  try {
    const { db } = await import("@/lib/db.server");
    const profiles = await db.selectFrom("profiles").select(["id"]).execute();
    if (profiles.length === 0) return { success: false, recipientCount: 0 };
    const title = `Nueva receta oficial: ${recipeTitle.slice(0, 100)}`;
    const message = `¡Hola! Hemos publicado una nueva receta oficial en Melik: "${recipeTitle}". ¡Descúbrela ya en el catálogo!`;
    const rows = profiles.map((p) => ({
      user_id: p.id,
      title,
      message,
      type: "system" as const,
      is_read: false,
    }));
    let inserted = 0;
    for (let i = 0; i < rows.length; i += 250) {
      const chunk = rows.slice(i, i + 250);
      try {
        await db.insertInto("notifications").values(chunk).execute();
        inserted += chunk.length;
      } catch {
        // best-effort broadcast — continue with remaining chunks
      }
    }
    return { success: true, recipientCount: inserted };
  } catch (err) {
    console.error("[broadcastOfficialRecipeNotification] Error:", err);
    return { success: false, recipientCount: 0 };
  }
}

const adminCreateSchema = recipeInputSchema.extend({
  isOfficialMelik: z.literal(true).default(true),
});

export const adminCreateOfficialRecipe = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => adminCreateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { assertAdmin } = await import("@/lib/auth/authorize.server");
    await assertAdmin(context.userId);
    const { db } = await import("@/lib/db.server");
    const cols = rowToDbColumns({ ...data, isOfficialMelik: true, isPublic: false }, { admin: true });
    const row = await db
      .insertInto("recipes")
      .values({ user_id: context.userId, ...cols })
      .returning(["id"])
      .executeTakeFirstOrThrow();

    if (!cols.is_draft) {
      await broadcastOfficialRecipeNotification(row.id, data.title);
    }

    return { id: row.id };
  });

export const adminDeleteOfficialRecipe = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { assertAdmin } = await import("@/lib/auth/authorize.server");
    await assertAdmin(context.userId);
    const { db } = await import("@/lib/db.server");
    await db.deleteFrom("recipes").where("id", "=", data.id).where("is_official_melik", "=", true).execute();
    return { ok: true };
  });

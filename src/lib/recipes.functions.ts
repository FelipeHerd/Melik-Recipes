import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  parseIngredients,
  parseSteps,
  serializeIngredients,
  serializeSteps,
  type Ingredient,
  type Step,
} from "@/lib/recipe-format";
import type { Json } from "@/integrations/supabase/types";

const IMAGE_BUCKET = "recipe-images";
// 7 days — refreshed on every listRecipes call (queries refetch on staleTime).
const SIGNED_URL_TTL = 60 * 60 * 24 * 7;

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
  // stripped by the DB trigger `prevent_recipe_privilege_escalation` — we
  // still gate them here so an admin's request is honoured cleanly and a
  // regular user's request never even sends the column.
  isOfficialMelik: z.boolean().optional(),
  isPremiumOnly: z.boolean().optional(),
});

export type RecipeInput = z.infer<typeof recipeInputSchema>;

// Vacuna #1 — Server-side paywall enforcement.
// If a NON-premium user tries to set isPublic=false (make private), we force
// it back to true. Never trust the client flag.
async function enforcePublicFlag(
  // Typed loosely to avoid coupling to the deep Supabase generic here.
  supabase: {
    from: (t: "profiles") => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      select: (c: string) => any;
    };
  },
  userId: string,
  requested: boolean | undefined,
): Promise<boolean | undefined> {
  if (requested !== false) return requested;
  const { data } = await supabase
    .from("profiles")
    .select("is_premium")
    .eq("id", userId)
    .maybeSingle();
  return (data as { is_premium?: boolean | null } | null)?.is_premium ? false : true;
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
    ingredients_json: ingredients as unknown as Json,
    instructions_json: instructions as unknown as Json,
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

async function signMany(
  supabase: { storage: { from: (b: string) => { createSignedUrls: (p: string[], ttl: number) => Promise<{ data: Array<{ path: string | null; signedUrl: string | null }> | null }> } } },
  paths: string[],
) {
  const map = new Map<string, string>();
  const unique = Array.from(new Set(paths.filter(Boolean)));
  if (unique.length === 0) return map;
  const { data: signed } = await supabase.storage.from(IMAGE_BUCKET).createSignedUrls(unique, SIGNED_URL_TTL);
  for (const s of signed ?? []) {
    if (s.path && s.signedUrl) map.set(s.path, s.signedUrl);
  }
  return map;
}

// Firma imágenes con transformación server-side (redimensionado + calidad),
// devolviendo miniaturas de ~40-80 KB en lugar del original (3-5 MB).
// Se usa SOLO para thumbnails de listado (covers de tarjetas), nunca para
// la vista de detalle (que sí necesita la imagen a tamaño completo).
async function signManyThumbnails(
  supabase: {
    storage: {
      from: (b: string) => {
        createSignedUrl: (
          p: string,
          ttl: number,
          opts?: { transform?: { width?: number; height?: number; quality?: number; resize?: "cover" | "contain" | "fill" } },
        ) => Promise<{ data: { signedUrl: string } | null; error: unknown }>;
        createSignedUrls: (p: string[], ttl: number) => Promise<{ data: Array<{ path: string | null; signedUrl: string | null }> | null }>;
      };
    };
  },
  paths: string[],
  transform: { width: number; height: number; quality: number },
) {
  const map = new Map<string, string>();
  const unique = Array.from(new Set(paths.filter(Boolean)));
  if (unique.length === 0) return map;
  const bucket = supabase.storage.from(IMAGE_BUCKET);
  const results = await Promise.all(
    unique.map(async (p) => {
      try {
        const { data } = await bucket.createSignedUrl(p, SIGNED_URL_TTL, {
          transform: { ...transform, resize: "cover" },
        });
        return { path: p, url: data?.signedUrl ?? null };
      } catch {
        return { path: p, url: null };
      }
    }),
  );
  const missing = results.filter((r) => !r.url).map((r) => r.path);
  if (missing.length > 0) {
    // Fallback: si las transformaciones no están disponibles, servir el
    // original firmado (mejor que romper el thumbnail).
    const { data: fallback } = await bucket.createSignedUrls(missing, SIGNED_URL_TTL);
    for (const s of fallback ?? []) {
      if (s.path && s.signedUrl) map.set(s.path, s.signedUrl);
    }
  }
  for (const r of results) {
    if (r.url) map.set(r.path, r.url);
  }
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
  created_at: string;
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

// Pilar 4: paginación keyset por `created_at` descendente.
export const listRecipes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => listInputSchema.parse(input) ?? {})
  .handler(async ({ data, context }): Promise<RecipesPage> => {
    const limit = data?.limit ?? 12;
    const cursor = data?.cursor ?? null;
    let q = context.supabase
      .from("recipes")
      .select(
        "id, title, category, emoji, time_minutes, ingredients, instructions, ingredients_json, instructions_json, notes, created_at, image_url, is_public, original_author",
      )
      .eq("user_id", context.userId)
      .eq("is_draft", false)
      .order("created_at", { ascending: false })
      .limit(limit + 1);
    if (cursor) q = q.lt("created_at", cursor);
    const { data: rowsData, error } = await q;
    if (error) throw new Error("APP-SYS-001: " + error.message);

    const rows = (rowsData ?? []) as unknown as RecipeRow[];
    const hasMore = rows.length > limit;
    const trimmed = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore
      ? new Date(trimmed[trimmed.length - 1].created_at).toISOString()
      : null;

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
      signManyThumbnails(context.supabase, coverPaths, { width: 640, height: 400, quality: 70 }),
      signManyThumbnails(context.supabase, stepPaths, { width: 800, height: 800, quality: 75 }),
    ]);
    const signedByPath = new Map<string, string>([...coverMap, ...stepMap]);
    return { items: trimmed.map((r) => shapeRow(r, signedByPath)), nextCursor };
  });

export const createRecipe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: RecipeInput) => recipeInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    // Vacuna #1: enforce paywall server-side before insert.
    const safeIsPublic = await enforcePublicFlag(context.supabase, context.userId, data.isPublic);
    // Admin flags require admin/dev role. The DB trigger also enforces this,
    // but we gate at the JS layer so a non-admin never sees a silent no-op.
    let admin = false;
    if (data.isOfficialMelik === true || data.isPremiumOnly === true) {
      const { isAdmin } = await import("@/lib/premium.server");
      admin = await isAdmin(context.userId);
      if (!admin) throw new Error("APP-PERM-002: admin required");
    }
    const cols = rowToDbColumns({ ...data, isPublic: safeIsPublic }, { admin });
    const { data: row, error } = await context.supabase
      .from("recipes")
      .insert({ user_id: context.userId, ...cols })
      .select("id, created_at")
      .single();
    if (error) throw new Error("APP-SYS-001: " + error.message);
    return { id: row.id, createdAt: new Date(row.created_at).getTime() };
  });

const updateInputSchema = recipeInputSchema.extend({
  id: z.string().uuid(),
  removedImagePaths: z.array(z.string().max(500)).max(40).optional().default([]),
});

export const updateRecipe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.infer<typeof updateInputSchema>) => updateInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { id, removedImagePaths, ...rest } = data;
    const safeIsPublic = await enforcePublicFlag(context.supabase, context.userId, rest.isPublic);
    let admin = false;
    if (rest.isOfficialMelik === true || rest.isPremiumOnly === true) {
      const { isAdmin } = await import("@/lib/premium.server");
      admin = await isAdmin(context.userId);
      if (!admin) throw new Error("APP-PERM-002: admin required");
    } else if (
      typeof rest.isOfficialMelik === "boolean" ||
      typeof rest.isPremiumOnly === "boolean"
    ) {
      // Admin editing existing official recipe may need to *clear* a flag.
      const { isAdmin } = await import("@/lib/premium.server");
      admin = await isAdmin(context.userId);
    }
    const cols = rowToDbColumns({ ...rest, isPublic: safeIsPublic }, { admin });
    // Admin edits of official recipes go through the service role so RLS
    // doesn't hide the row (the owner check is enforced above by role gate
    // + the DB trigger stripping non-admin admin-flag writes).
    const client = admin
      ? (await import("@/integrations/supabase/client.server")).supabaseAdmin
      : context.supabase;
    const { error } = await client.from("recipes").update(cols).eq("id", id);
    if (error) throw new Error("APP-SYS-001: " + error.message);

    if (removedImagePaths.length > 0) {
      const own = removedImagePaths.filter((p) => p.startsWith(`${context.userId}/`));
      if (own.length > 0) {
        await context.supabase.storage.from(IMAGE_BUCKET).remove(own);
      }
    }
    return { ok: true };
  });

export const deleteRecipe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("recipes")
      .select("image_url, instructions_json")
      .eq("id", data.id)
      .maybeSingle();
    const toRemove: string[] = [];
    if (row?.image_url) toRemove.push(row.image_url);
    if (row?.instructions_json) {
      for (const s of parseSteps(row.instructions_json)) if (s.imagePath) toRemove.push(s.imagePath);
    }
    if (toRemove.length > 0) {
      const own = toRemove.filter((p) => p.startsWith(`${context.userId}/`));
      if (own.length > 0) await context.supabase.storage.from(IMAGE_BUCKET).remove(own);
    }
    const { error } = await context.supabase.from("recipes").delete().eq("id", data.id);
    if (error) throw new Error("APP-SYS-001: " + error.message);
    return { ok: true };
  });

export const migrateGuestRecipes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { recipes: RecipeInput[] }) =>
    z.object({ recipes: z.array(recipeInputSchema).max(500) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    if (data.recipes.length === 0) return { inserted: 0 };
    const rows = data.recipes.map((r) => ({ user_id: context.userId, ...rowToDbColumns(r) }));
    const { error, count } = await context.supabase.from("recipes").insert(rows, { count: "exact" });
    if (error) throw new Error("APP-SYS-001: " + error.message);
    return { inserted: count ?? rows.length };
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
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ recipes: z.array(importRowSchema).max(500) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    if (data.recipes.length === 0) return { inserted: 0, skipped: 0 };

    const { data: existing, error: exErr } = await context.supabase
      .from("recipes")
      .select("title, created_at");
    if (exErr) throw new Error("APP-SYS-001: " + exErr.message);

    const seen = new Set<string>();
    for (const row of existing ?? []) {
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
      ingredients_json: Json;
      instructions_json: Json;
      notes: string;
      created_at: string;
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
        ingredients_json: ingArr as unknown as Json,
        instructions_json: stepArr as unknown as Json,
        notes: "",
        created_at: iso,
        // CSV imports are always private by default (never re-publish someone
        // else's recipe). original_author is preserved when present.
        is_public: false,
        original_author: r.originalAuthor ?? null,
      });
    }

    if (toInsert.length === 0) return { inserted: 0, skipped };
    const { error, count } = await context.supabase
      .from("recipes")
      .insert(toInsert, { count: "exact" });
    if (error) throw new Error("APP-SYS-001: " + error.message);
    return { inserted: count ?? toInsert.length, skipped };
  });

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

export const uploadRecipeImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
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

    const { error: upErr } = await context.supabase.storage
      .from(IMAGE_BUCKET)
      .upload(path, file, {
        contentType: file.type,
        cacheControl: "31536000",
        upsert: false,
      });
    if (upErr) throw new Error("APP-SYS-001: " + upErr.message);

    const { data: signed, error: signErr } = await context.supabase.storage
      .from(IMAGE_BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL);
    if (signErr) throw new Error("APP-SYS-001: " + signErr.message);

    return { path, signedUrl: signed.signedUrl };
  });

export const getProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("profiles")
      .select(
        "id, first_name, last_name, avatar_url, is_premium, username, role, kiko_blocked_until, premium_until, subscription_status",
      )
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw new Error("APP-SYS-001: " + error.message);
    return (
      data ?? {
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
      }
    );
  });

export const deleteAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(context.userId);
    if (error) throw new Error("APP-SYS-001: " + error.message);
    return { ok: true };
  });

// ---- Drafts ----

export const listDrafts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RecipesPage> => {
    const { data: rowsData, error } = await context.supabase
      .from("recipes")
      .select(
        "id, title, category, emoji, time_minutes, ingredients, instructions, ingredients_json, instructions_json, notes, created_at, image_url, is_public, original_author",
      )
      .eq("user_id", context.userId)
      .eq("is_draft", true)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error("APP-SYS-001: " + error.message);
    const rows = (rowsData ?? []) as unknown as RecipeRow[];
    const paths: string[] = [];
    for (const r of rows) {
      if (r.image_url) paths.push(r.image_url);
      const steps = r.instructions_json != null ? parseSteps(r.instructions_json) : parseSteps(r.instructions);
      for (const s of steps) if (s.imagePath) paths.push(s.imagePath);
    }
    const signedByPath = await signMany(context.supabase, paths);
    return { items: rows.map((r) => shapeRow(r, signedByPath)), nextCursor: null };
  });

const saveDraftInputSchema = recipeInputSchema.extend({
  id: z.string().uuid().optional().nullable(),
});

export const saveDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.infer<typeof saveDraftInputSchema>) => saveDraftInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { id, ...rest } = data;
    const cols = rowToDbColumns({ ...rest, isDraft: true });
    if (id) {
      const { error } = await context.supabase
        .from("recipes")
        .update(cols)
        .eq("id", id)
        .eq("user_id", context.userId);
      if (error) throw new Error("APP-SYS-001: " + error.message);
      return { id };
    }
    const { data: row, error } = await context.supabase
      .from("recipes")
      .insert({ user_id: context.userId, ...cols })
      .select("id")
      .single();
    if (error) throw new Error("APP-SYS-001: " + error.message);
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
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminCatalogRow[]> => {
    const { isAdmin } = await import("@/lib/premium.server");
    if (!(await isAdmin(context.userId))) {
      throw new Error("APP-PERM-002: admin required");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("recipes")
      .select(
        "id, title, category, emoji, time_minutes, image_url, ingredients, instructions, ingredients_json, instructions_json, is_draft, is_premium_only, created_at",
      )
      .eq("is_official_melik", true)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error("APP-SYS-001: " + error.message);

    const paths = (rows ?? []).map((r) => r.image_url).filter((p): p is string => !!p);
    const signedByPath = await signMany(supabaseAdmin, paths);

    return (rows ?? []).map((r) => {
      const ingredients =
        r.ingredients_json != null ? parseIngredients(r.ingredients_json) : parseIngredients(r.ingredients);
      const stepsRaw =
        r.instructions_json != null ? parseSteps(r.instructions_json) : parseSteps(r.instructions);
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profiles, error: pErr } = await supabaseAdmin.from("profiles").select("id");
    if (pErr || !profiles || profiles.length === 0) {
      return { success: false, recipientCount: 0 };
    }
    const title = `Nueva receta oficial: ${recipeTitle.slice(0, 100)}`;
    const message = `¡Hola! Hemos publicado una nueva receta oficial en Melik: "${recipeTitle}". ¡Descúbrela ya en el catálogo!`;
    const rows = profiles.map((p) => ({
      user_id: p.id,
      title,
      message,
      type: "system",
      is_read: false,
    }));
    let inserted = 0;
    for (let i = 0; i < rows.length; i += 250) {
      const chunk = rows.slice(i, i + 250);
      const { error: insErr } = await supabaseAdmin.from("notifications").insert(chunk);
      if (!insErr) inserted += chunk.length;
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
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => adminCreateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { isAdmin } = await import("@/lib/premium.server");
    if (!(await isAdmin(context.userId))) {
      throw new Error("APP-PERM-002: admin required");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const cols = rowToDbColumns(
      { ...data, isOfficialMelik: true, isPublic: false },
      { admin: true },
    );
    const { data: row, error } = await supabaseAdmin
      .from("recipes")
      .insert({ user_id: context.userId, ...cols })
      .select("id")
      .single();
    if (error) throw new Error("APP-SYS-001: " + error.message);

    if (!cols.is_draft) {
      await broadcastOfficialRecipeNotification(row.id, data.title);
    }

    return { id: row.id };
  });

export const adminDeleteOfficialRecipe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { isAdmin } = await import("@/lib/premium.server");
    if (!(await isAdmin(context.userId))) {
      throw new Error("APP-PERM-002: admin required");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("recipes")
      .delete()
      .eq("id", data.id)
      .eq("is_official_melik", true);
    if (error) throw new Error("APP-SYS-001: " + error.message);
    return { ok: true };
  });


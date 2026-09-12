// Server functions for the Melik Bakery premium catalog + dev premium toggle.
// SECURITY:
// - listOfficialRecipes is PUBLIC (guests can see the catalog), returns only
//   safe columns. Ingredients/instructions are NEVER exposed here.
// - getOfficialRecipe requires auth AND is_premium_only unlock. Otherwise it
//   returns a locked (redacted) DTO. The frontend never decides access.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/require-auth.server";
import { parseIngredients, parseSteps, type Ingredient, type Step } from "@/lib/recipe-format";

const IMAGE_BUCKET = "recipe-images";
const SIGNED_URL_TTL = 60 * 60 * 24 * 7;
const COVER_THUMB = { width: 640, height: 400, quality: 70 };

async function signMany(paths: string[]): Promise<Map<string, string>> {
  const { signPaths } = await import("@/lib/storage/signed-url.server");
  const unique = Array.from(new Set(paths.filter(Boolean)));
  return signPaths(IMAGE_BUCKET, unique, SIGNED_URL_TTL);
}

// Thumbnail signer for card lists — signs the pre-generated thumbnail when
// present, falling back to the full-size original otherwise.
async function signThumbnails(
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

export type OfficialRecipeCardDto = {
  id: string;
  title: string;
  category: string;
  emoji: string;
  timeMinutes: number;
  imagePath: string | null;
  imageUrl: string | null;
  ingredients: Ingredient[];
  instructions: Step[];
  createdAt: number;
  isOfficialMelik: true;
  isBakerMode: boolean;
  isPremiumOnly: boolean;
};

export type OfficialRecipesPage = {
  items: OfficialRecipeCardDto[];
  nextCursor: string | null;
};

const listInputSchema = z
  .object({
    cursor: z.string().datetime().nullable().optional(),
    limit: z.number().int().min(1).max(50).optional(),
  })
  .optional();

// Pilar 4: paginación keyset por `created_at` descendente.
// Trae `limit + 1` para detectar si hay siguiente página sin OFFSET.
export const listOfficialRecipes = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => listInputSchema.parse(input) ?? {})
  .handler(async ({ data }): Promise<OfficialRecipesPage> => {
    const limit = data?.limit ?? 12;
    const cursor = data?.cursor ?? null;
    const { db } = await import("@/lib/db.server");
    let q = db
      .selectFrom("recipes")
      .select(["id", "title", "category", "emoji", "time_minutes", "image_url", "created_at", "is_baker_mode", "is_premium_only"])
      .where("is_official_melik", "=", true)
      .where("is_draft", "=", false)
      .orderBy("created_at", "desc")
      .limit(limit + 1);
    if (cursor) q = q.where("created_at", "<", new Date(cursor));
    const rows = await q.execute();

    const hasMore = rows.length > limit;
    const trimmed = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? new Date(trimmed[trimmed.length - 1].created_at).toISOString() : null;

    const paths = trimmed.map((r) => r.image_url).filter((p): p is string => !!p);
    const signed = await signThumbnails(paths, COVER_THUMB);

    const items: OfficialRecipeCardDto[] = trimmed.map((r) => ({
      id: r.id,
      title: r.title,
      category: r.category ?? "",
      emoji: r.emoji ?? "🍽️",
      timeMinutes: r.time_minutes ?? 0,
      imagePath: r.image_url ?? null,
      imageUrl: r.image_url ? signed.get(r.image_url) ?? null : null,
      ingredients: [],
      instructions: [],
      createdAt: new Date(r.created_at).getTime(),
      isOfficialMelik: true as const,
      isBakerMode: !!r.is_baker_mode,
      isPremiumOnly: !!r.is_premium_only,
    }));

    return { items, nextCursor };
  });

export type OfficialRecipeFullDto = OfficialRecipeCardDto & {
  /** True when the server has stripped ingredients/instructions because the
   *  caller doesn't have an active Melik+ subscription. */
  isLocked: boolean;
};

export const getOfficialRecipe = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<OfficialRecipeFullDto> => {
    const { db } = await import("@/lib/db.server");
    const row = await db
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
        "created_at",
        "is_baker_mode",
        "is_premium_only",
      ])
      .where("id", "=", data.id)
      .where("is_official_melik", "=", true)
      .executeTakeFirst();
    if (!row) throw new Error("APP-RCP-001: not found");

    // Server-Side Redaction: ingredientes + pasos salen del servidor como []
    // salvo que la receta no sea premium-only o el usuario tenga un desbloqueo
    // permanente registrado en `bakery_unlocks`. El paywall en la UI es
    // presentacional — los datos sensibles nunca cruzaron el cable.
    let isLocked = false;
    if (row.is_premium_only) {
      const unlock = await db
        .selectFrom("bakery_unlocks")
        .select(["user_id"])
        .where("user_id", "=", context.userId)
        .where("recipe_id", "=", row.id)
        .executeTakeFirst();
      isLocked = !unlock;
    }

    const paths: string[] = [];
    if (row.image_url) paths.push(row.image_url);

    if (!isLocked) {
      const ingredients: Ingredient[] =
        row.ingredients_json != null ? parseIngredients(row.ingredients_json) : parseIngredients(row.ingredients);
      const stepsRaw = row.instructions_json != null ? parseSteps(row.instructions_json) : parseSteps(row.instructions);
      for (const s of stepsRaw) if (s.imagePath) paths.push(s.imagePath);
      const signed = await signMany(paths);
      const instructions: Step[] = stepsRaw.map((s) => ({
        text: s.text,
        imagePath: s.imagePath ?? null,
        imageUrl: s.imagePath ? signed.get(s.imagePath) ?? null : null,
      }));
      return {
        id: row.id,
        title: row.title,
        category: row.category ?? "",
        emoji: row.emoji ?? "🍽️",
        timeMinutes: row.time_minutes ?? 0,
        imagePath: row.image_url ?? null,
        imageUrl: row.image_url ? signed.get(row.image_url) ?? null : null,
        ingredients,
        instructions,
        createdAt: new Date(row.created_at).getTime(),
        isOfficialMelik: true as const,
        isBakerMode: !!row.is_baker_mode,
        isPremiumOnly: !!row.is_premium_only,
        isLocked: false,
      };
    }

    const signed = await signMany(paths);
    return {
      id: row.id,
      title: row.title,
      category: row.category ?? "",
      emoji: row.emoji ?? "🍽️",
      timeMinutes: row.time_minutes ?? 0,
      imagePath: row.image_url ?? null,
      imageUrl: row.image_url ? signed.get(row.image_url) ?? null : null,
      ingredients: [],
      instructions: [],
      createdAt: new Date(row.created_at).getTime(),
      isOfficialMelik: true as const,
      isBakerMode: !!row.is_baker_mode,
      isPremiumOnly: true,
      isLocked: true,
    };
  });

// DEV ONLY — toggle current user's premium flag for local testing.
// TODO: remove in Fase 4 when real subscriptions land.
export const toggleDevPremium = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { assertDevOrReject } = await import("./dev-guard.server");
    await assertDevOrReject(context.userId);
    const { db } = await import("@/lib/db.server");
    const current = await db.selectFrom("profiles").select(["is_premium"]).where("id", "=", context.userId).executeTakeFirst();
    const next = !(current?.is_premium ?? false);
    await db.updateTable("profiles").set({ is_premium: next }).where("id", "=", context.userId).execute();

    const { sendTemplatedNotification } = await import("./notifications.server");
    await sendTemplatedNotification(context.userId, next ? "dev_plus_granted" : "dev_plus_revoked", {}, { initiatedBySelf: true });
    return { isPremium: next };
  });

// DEV ONLY — self-grant o revocación de trial Melik+.
// `days` positivo: extiende `premium_until` en N días desde hoy (o desde el
// valor actual si es futuro). `null`: revoca el trial. Solo cuentas con rol dev.

export const grantSelfDevTrial = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => z.object({ days: z.number().int().min(-1).max(365).nullable() }).parse(input))
  .handler(async ({ data, context }): Promise<{ premiumUntil: string | null }> => {
    const { assertDevOrReject } = await import("./dev-guard.server");
    await assertDevOrReject(context.userId);
    const { db } = await import("@/lib/db.server");

    if (data.days === null) {
      await db.updateTable("profiles").set({ premium_until: null }).where("id", "=", context.userId).execute();
      return { premiumUntil: null };
    }

    const cur = await db.selectFrom("profiles").select(["premium_until"]).where("id", "=", context.userId).executeTakeFirst();
    const base = cur?.premium_until && new Date(cur.premium_until) > new Date() ? new Date(cur.premium_until) : new Date();
    base.setUTCDate(base.getUTCDate() + data.days);
    const iso = base.toISOString();
    await db.updateTable("profiles").set({ premium_until: iso }).where("id", "=", context.userId).execute();

    const { sendTemplatedNotification } = await import("./notifications.server");
    const dias = data.days === 1 ? "1 día" : `${data.days} días`;
    const fechaFin = new Date(iso).toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
    await sendTemplatedNotification(context.userId, "dev_trial_granted", { duracion: dias, fecha_fin: fechaFin }, { initiatedBySelf: true });
    return { premiumUntil: iso };
  });

// Server functions for the Melik Bakery premium catalog + dev premium toggle.
// SECURITY:
// - listOfficialRecipes is PUBLIC (guests can see the catalog), returns only
//   safe columns via supabaseAdmin. Ingredients/instructions are NEVER
//   exposed here.
// - getOfficialRecipe requires auth AND is_premium = true. Otherwise it
//   throws 402 Payment Required. The frontend never decides access.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  parseIngredients,
  parseSteps,
  type Ingredient,
  type Step,
} from "@/lib/recipe-format";

const IMAGE_BUCKET = "recipe-images";
const SIGNED_URL_TTL = 60 * 60 * 24 * 7;

type SignFn = (paths: string[]) => Promise<Map<string, string>>;

function makeSigner(client: {
  storage: {
    from: (b: string) => {
      createSignedUrls: (
        p: string[],
        ttl: number,
      ) => Promise<{ data: Array<{ path: string | null; signedUrl: string | null }> | null }>;
    };
  };
}): SignFn {
  return async (paths) => {
    const map = new Map<string, string>();
    const unique = Array.from(new Set(paths.filter(Boolean)));
    if (unique.length === 0) return map;
    const { data } = await client.storage.from(IMAGE_BUCKET).createSignedUrls(unique, SIGNED_URL_TTL);
    for (const s of data ?? []) {
      if (s.path && s.signedUrl) map.set(s.path, s.signedUrl);
    }
    return map;
  };
}

// Thumbnail signer for card lists (server-side transform: 640×400 q70).
async function signThumbnails(
  client: {
    storage: {
      from: (b: string) => {
        createSignedUrl: (
          p: string,
          ttl: number,
          opts?: { transform?: { width?: number; height?: number; quality?: number; resize?: "cover" | "contain" | "fill" } },
        ) => Promise<{ data: { signedUrl: string } | null }>;
        createSignedUrls: (p: string[], ttl: number) => Promise<{ data: Array<{ path: string | null; signedUrl: string | null }> | null }>;
      };
    };
  },
  paths: string[],
  transform: { width: number; height: number; quality: number },
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = Array.from(new Set(paths.filter(Boolean)));
  if (unique.length === 0) return map;
  const bucket = client.storage.from(IMAGE_BUCKET);
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
    const { data: fallback } = await bucket.createSignedUrls(missing, SIGNED_URL_TTL);
    for (const s of fallback ?? []) {
      if (s.path && s.signedUrl) map.set(s.path, s.signedUrl);
    }
  }
  for (const r of results) if (r.url) map.set(r.path, r.url);
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("recipes")
      .select(
        "id, title, category, emoji, time_minutes, image_url, created_at, is_baker_mode, is_premium_only",
      )
      .eq("is_official_melik", true)
      .eq("is_draft", false)
      .order("created_at", { ascending: false })
      .limit(limit + 1);
    if (cursor) q = q.lt("created_at", cursor);
    const { data: rows, error } = await q;
    if (error) throw new Error("APP-SYS-001: " + error.message);

    const list = rows ?? [];
    const hasMore = list.length > limit;
    const trimmed = hasMore ? list.slice(0, limit) : list;
    const nextCursor = hasMore ? new Date(trimmed[trimmed.length - 1].created_at).toISOString() : null;

    const paths = trimmed.map((r) => r.image_url).filter((p): p is string => !!p);
    const signed = await signThumbnails(supabaseAdmin, paths, { width: 640, height: 400, quality: 70 });

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
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<OfficialRecipeFullDto> => {
    void context; // silence unused when we don't need context.supabase directly
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("recipes")
      .select(
        "id, title, category, emoji, time_minutes, image_url, ingredients, instructions, ingredients_json, instructions_json, created_at, is_baker_mode, is_premium_only",
      )
      .eq("id", data.id)
      .eq("is_official_melik", true)
      .maybeSingle();
    if (error) throw new Error("APP-SYS-001: " + error.message);
    if (!row) throw new Error("APP-RCP-001: not found");

    // Server-Side Redaction: ingredientes + pasos salen del servidor como []
    // salvo que la receta no sea premium-only o el usuario tenga un desbloqueo
    // permanente registrado en `bakery_unlocks`. El paywall en la UI es
    // presentacional — los datos sensibles nunca cruzaron el cable.
    let isLocked = false;
    if (row.is_premium_only) {
      const { data: unlock } = await supabaseAdmin
        .from("bakery_unlocks")
        .select("user_id")
        .eq("user_id", context.userId)
        .eq("recipe_id", row.id)
        .maybeSingle();
      isLocked = !unlock;
    }


    const sign = makeSigner(supabaseAdmin);
    const paths: string[] = [];
    if (row.image_url) paths.push(row.image_url);

    let ingredients: Ingredient[] = [];
    let instructions: Step[] = [];
    if (!isLocked) {
      ingredients =
        row.ingredients_json != null ? parseIngredients(row.ingredients_json) : parseIngredients(row.ingredients);
      const stepsRaw =
        row.instructions_json != null ? parseSteps(row.instructions_json) : parseSteps(row.instructions);
      for (const s of stepsRaw) if (s.imagePath) paths.push(s.imagePath);
      const signed = await sign(paths);
      instructions = stepsRaw.map((s) => ({
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

    const signed = await sign(paths);
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
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertDevOrReject } = await import("./dev-guard.server");
    await assertDevOrReject(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: current, error: readErr } = await supabaseAdmin
      .from("profiles")
      .select("is_premium")
      .eq("id", context.userId)
      .maybeSingle();
    if (readErr) throw new Error("APP-SYS-001: " + readErr.message);
    const next = !(current?.is_premium ?? false);
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ is_premium: next })
      .eq("id", context.userId);
    if (error) throw new Error("APP-SYS-001: " + error.message);

    const { sendTemplatedNotification } = await import("./notifications.server");
    await sendTemplatedNotification(
      context.userId,
      next ? "dev_plus_granted" : "dev_plus_revoked",
      {},
      { initiatedBySelf: true },
    );
    return { isPremium: next };
  });

// DEV ONLY — self-grant o revocación de trial Melik+.
// `days` positivo: extiende `premium_until` en N días desde hoy (o desde el
// valor actual si es futuro). `null`: revoca el trial. Solo cuentas con rol dev.

export const grantSelfDevTrial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ days: z.number().int().min(-1).max(365).nullable() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ premiumUntil: string | null }> => {
    const { assertDevOrReject } = await import("./dev-guard.server");
    await assertDevOrReject(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.days === null) {
      const { error } = await supabaseAdmin
        .from("profiles")
        .update({ premium_until: null })
        .eq("id", context.userId);
      if (error) throw new Error("APP-SYS-001: " + error.message);
      return { premiumUntil: null };
    }

    const { data: cur } = await supabaseAdmin
      .from("profiles")
      .select("premium_until")
      .eq("id", context.userId)
      .maybeSingle();
    const base =
      cur?.premium_until && new Date(cur.premium_until) > new Date()
        ? new Date(cur.premium_until)
        : new Date();
    base.setUTCDate(base.getUTCDate() + data.days);
    const iso = base.toISOString();
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ premium_until: iso })
      .eq("id", context.userId);
    if (error) throw new Error("APP-SYS-001: " + error.message);

    const { sendTemplatedNotification } = await import("./notifications.server");
    const dias = data.days === 1 ? "1 día" : `${data.days} días`;
    const fechaFin = new Date(iso).toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
    await sendTemplatedNotification(
      context.userId,
      "dev_trial_granted",
      { duracion: dias, fecha_fin: fechaFin },
      { initiatedBySelf: true },
    );
    return { premiumUntil: iso };
  });



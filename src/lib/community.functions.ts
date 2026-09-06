// Community feed — public recipes shared by other users.
// Vacuna #2: this DTO NEVER exposes image_url. The community tab renders
// emoji placeholders because recipe-images RLS is anchored to owner user_id;
// signing an image belonging to another user would render a broken image.
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

export type CommunityRecipe = {
  id: string;
  title: string;
  category: string;
  emoji: string;
  timeMinutes: number;
  notes: string;
  ingredients: Ingredient[];
  instructions: Step[]; // imagePath / imageUrl always null in community
  isBakerMode: boolean;
  originalAuthor: string; // guaranteed non-null via profiles.username fallback
  authorId: string;
  createdAt: string;
};

export type CommunityPage = {
  items: CommunityRecipe[];
  nextCursor: string | null;
};

const listInputSchema = z
  .object({
    cursor: z.string().datetime().nullable().optional(),
    limit: z.number().int().min(1).max(30).optional(),
  })
  .optional();

export const listCommunityRecipes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => listInputSchema.parse(input) ?? {})
  .handler(async ({ data, context }): Promise<CommunityPage> => {
    const limit = data?.limit ?? 12;
    const cursor = data?.cursor ?? null;
    let q = context.supabase
      .from("recipes")
      .select(
        "id, title, category, emoji, time_minutes, notes, ingredients, instructions, ingredients_json, instructions_json, is_baker_mode, original_author, user_id, created_at",
      )
      .eq("is_public", true)
      .eq("is_draft", false)
      .eq("is_official_melik", false)
      .order("created_at", { ascending: false })
      .limit(limit + 1);
    if (cursor) q = q.lt("created_at", cursor);

    const { data: rowsData, error } = await q;
    if (error) throw new Error("APP-SYS-001: " + error.message);
    const rows = rowsData ?? [];
    const hasMore = rows.length > limit;
    const trimmed = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore
      ? new Date(trimmed[trimmed.length - 1].created_at).toISOString()
      : null;

    // Batch lookup: usernames for rows without original_author.
    const missingAuthorIds = Array.from(
      new Set(
        trimmed
          .filter((r) => !r.original_author)
          .map((r) => r.user_id),
      ),
    );
    const usernameByUserId = new Map<string, string>();
    if (missingAuthorIds.length > 0) {
      const { data: profiles } = await context.supabase
        .from("profiles")
        .select("id, username")
        .in("id", missingAuthorIds);
      for (const p of profiles ?? []) {
        if (p.username) usernameByUserId.set(p.id, p.username);
      }
    }

    const items: CommunityRecipe[] = trimmed.map((r) => {
      const ingredients: Ingredient[] =
        r.ingredients_json != null
          ? parseIngredients(r.ingredients_json)
          : parseIngredients(r.ingredients);
      const stepsRaw: Step[] =
        r.instructions_json != null
          ? parseSteps(r.instructions_json)
          : parseSteps(r.instructions);
      return {
        id: r.id,
        title: r.title,
        category: r.category ?? "Otro",
        emoji: r.emoji ?? "🍽️",
        timeMinutes: r.time_minutes ?? 0,
        notes: r.notes ?? "",
        ingredients,
        instructions: stepsRaw.map((s) => ({
          text: s.text,
          imagePath: null,
          imageUrl: null,
        })),
        isBakerMode: !!r.is_baker_mode,
        originalAuthor:
          r.original_author ?? usernameByUserId.get(r.user_id) ?? "usuario",
        authorId: r.user_id,
        createdAt: r.created_at,
      };
    });

    return { items, nextCursor };
  });

// ---- saveCommunityRecipe ----
// Clone a public recipe into the caller's library. Attribution is set to the
// origin's original_author (or origin author's username as fallback). Images
// are NEVER copied — receiver uploads their own.
export const saveCommunityRecipe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ recipeId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: origin, error: readErr } = await context.supabase
      .from("recipes")
      .select(
        "title, category, emoji, time_minutes, notes, ingredients, instructions, ingredients_json, instructions_json, is_baker_mode, original_author, user_id, is_public, is_draft, is_official_melik",
      )
      .eq("id", data.recipeId)
      .eq("is_public", true)
      .eq("is_draft", false)
      .eq("is_official_melik", false)
      .maybeSingle();
    if (readErr) throw new Error("APP-SYS-001: " + readErr.message);
    if (!origin) throw new Error("Receta no disponible");
    if (origin.user_id === context.userId) {
      throw new Error("APP-RCP-002: already owned");
    }

    let originalAuthor: string | null = origin.original_author ?? null;
    if (!originalAuthor) {
      const { data: profile } = await context.supabase
        .from("profiles")
        .select("username")
        .eq("id", origin.user_id)
        .maybeSingle();
      originalAuthor = profile?.username ?? null;
    }

    const ingredients =
      origin.ingredients_json != null
        ? parseIngredients(origin.ingredients_json)
        : parseIngredients(origin.ingredients);
    const stepsRaw =
      origin.instructions_json != null
        ? parseSteps(origin.instructions_json)
        : parseSteps(origin.instructions);
    // Vacuna #2: strip every image path from the clone.
    const instructions = stepsRaw.map((s) => ({
      text: s.text,
      imagePath: null as string | null,
    }));

    const { data: row, error } = await context.supabase
      .from("recipes")
      .insert({
        user_id: context.userId,
        title: origin.title,
        category: origin.category ?? "Otro",
        emoji: origin.emoji ?? "🍽️",
        time_minutes: origin.time_minutes ?? 0,
        notes: origin.notes ?? "",
        image_url: null,
        ingredients_json: ingredients as unknown as Json,
        instructions_json: instructions as unknown as Json,
        ingredients: serializeIngredients(ingredients),
        instructions: serializeSteps(instructions),
        is_baker_mode: !!origin.is_baker_mode,
        is_public: false,
        is_draft: false,
        is_official_melik: false,
        share_token: null,
        original_author: originalAuthor,
      })
      .select("id")
      .single();
    if (error) throw new Error("APP-SYS-001: " + error.message);
    return { id: row.id };
  });

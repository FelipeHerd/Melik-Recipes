// Recipe P2P sharing — generate share_token, resolve token to a DTO
// (service role bypass so anyone with the token can read the recipe), and
// clone into the current user's library.
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

export type SharedRecipeDTO = {
  title: string;
  category: string;
  emoji: string;
  timeMinutes: number;
  notes: string;
  imageUrl: string | null;
  ingredients: Ingredient[];
  instructions: (Step & { imageUrl: string | null })[];
  isBakerMode: boolean;
  originalAuthor: string | null;
};

const IMAGE_BUCKET = "recipe-images";
const SHARED_SIGNED_URL_TTL = 60 * 60 * 24; // 24h

// ---- generateShareToken ----
export const generateShareToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ recipeId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("recipes")
      .select("id, user_id, share_token, is_official_melik")
      .eq("id", data.recipeId)
      .maybeSingle();
    if (error) throw new Error("APP-SYS-001: " + error.message);
    if (!row) throw new Error("APP-RCP-001: recipe not found");
    if (row.user_id !== context.userId) throw new Error("No autorizado");
    if (row.is_official_melik) {
      throw new Error("APP-RCP-003: official recipe");
    }
    if (row.share_token) return { token: row.share_token };

    const token = crypto.randomUUID();
    const { error: upErr } = await context.supabase
      .from("recipes")
      .update({ share_token: token })
      .eq("id", data.recipeId);
    if (upErr) throw new Error("APP-SYS-001: " + upErr.message);
    return { token };
  });

// ---- getSharedRecipe ----
// Bypass RLS via service role so anyone with a valid token can read.
// Returns a sanitized DTO with signed URLs for cover + step images (24h TTL).
export const getSharedRecipe = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ token: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }): Promise<SharedRecipeDTO> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("recipes")
      .select(
        "title, category, emoji, time_minutes, notes, image_url, ingredients, instructions, ingredients_json, instructions_json, is_baker_mode, is_official_melik, original_author, user_id",
      )
      .eq("share_token", data.token)
      .maybeSingle();
    if (error) throw new Error("APP-SYS-001: " + error.message);
    if (!row) throw new Error("Enlace inválido o expirado");
    if (row.is_official_melik) throw new Error("Enlace inválido");

    let originalAuthor: string | null = row.original_author ?? null;
    if (!originalAuthor) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("username")
        .eq("id", row.user_id)
        .maybeSingle();
      originalAuthor = profile?.username ?? null;
    }

    const ingredients: Ingredient[] =
      row.ingredients_json != null
        ? parseIngredients(row.ingredients_json)
        : parseIngredients(row.ingredients);
    const steps: Step[] =
      row.instructions_json != null
        ? parseSteps(row.instructions_json)
        : parseSteps(row.instructions);

    const paths: string[] = [];
    if (row.image_url) paths.push(row.image_url);
    for (const s of steps) if (s.imagePath) paths.push(s.imagePath);
    const unique = Array.from(new Set(paths));
    const signedByPath = new Map<string, string>();
    if (unique.length > 0) {
      const { data: signed } = await supabaseAdmin.storage
        .from(IMAGE_BUCKET)
        .createSignedUrls(unique, SHARED_SIGNED_URL_TTL);
      for (const s of signed ?? []) {
        if (s.path && s.signedUrl) signedByPath.set(s.path, s.signedUrl);
      }
    }

    return {
      title: row.title,
      category: row.category ?? "Otro",
      emoji: row.emoji ?? "🍽️",
      timeMinutes: row.time_minutes ?? 0,
      notes: row.notes ?? "",
      imageUrl: row.image_url ? signedByPath.get(row.image_url) ?? null : null,
      ingredients,
      instructions: steps.map((s) => ({
        text: s.text,
        imagePath: null,
        imageUrl: s.imagePath ? signedByPath.get(s.imagePath) ?? null : null,
      })),
      isBakerMode: !!row.is_baker_mode,
      originalAuthor,
    };
  });

// ---- saveSharedRecipe ----
// Clone into the current user's recipes. Never inherits share_token.
// Takes ONLY the token: re-fetches server-side and copies image files into
// the new user's storage folder so recipe-images RLS keeps working. Not
// trusting client-supplied paths avoids letting a caller copy arbitrary
// files from another user's folder.
export const saveSharedRecipe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ token: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: row, error: fetchErr } = await supabaseAdmin
      .from("recipes")
      .select(
        "title, category, emoji, time_minutes, notes, image_url, ingredients, instructions, ingredients_json, instructions_json, is_baker_mode, is_official_melik, original_author, user_id",
      )
      .eq("share_token", data.token)
      .maybeSingle();
    if (fetchErr) throw new Error("APP-SYS-001: " + fetchErr.message);
    if (!row) throw new Error("Enlace inválido o expirado");
    if (row.is_official_melik) throw new Error("Enlace inválido");

    let originalAuthor: string | null = row.original_author ?? null;
    if (!originalAuthor) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("username")
        .eq("id", row.user_id)
        .maybeSingle();
      originalAuthor = profile?.username ?? null;
    }

    const ingredients =
      row.ingredients_json != null
        ? parseIngredients(row.ingredients_json)
        : parseIngredients(row.ingredients);
    const sourceSteps: Step[] =
      row.instructions_json != null
        ? parseSteps(row.instructions_json)
        : parseSteps(row.instructions);

    // Copy image files into the new owner's folder so their RLS grants read access.
    async function copyImage(srcPath: string | null | undefined): Promise<string | null> {
      if (!srcPath) return null;
      const ext = srcPath.split(".").pop()?.toLowerCase() || "jpg";
      const safeExt = /^[a-z0-9]{1,5}$/.test(ext) ? ext : "jpg";
      const dstPath = `${context.userId}/${crypto.randomUUID()}.${safeExt}`;
      const { error: copyErr } = await supabaseAdmin.storage
        .from(IMAGE_BUCKET)
        .copy(srcPath, dstPath);
      if (copyErr) return null;
      return dstPath;
    }

    const newCover = await copyImage(row.image_url);
    const newSteps: Step[] = await Promise.all(
      sourceSteps
        .filter((s) => s.text || s.imagePath)
        .map(async (s) => ({
          text: s.text,
          imagePath: await copyImage(s.imagePath ?? null),
        })),
    );

    const { data: inserted, error } = await context.supabase
      .from("recipes")
      .insert({
        user_id: context.userId,
        title: row.title,
        category: row.category ?? "Otro",
        emoji: row.emoji ?? "🍽️",
        time_minutes: row.time_minutes ?? 0,
        notes: row.notes ?? "",
        image_url: newCover,
        ingredients_json: ingredients as unknown as Json,
        instructions_json: newSteps as unknown as Json,
        ingredients: serializeIngredients(ingredients),
        instructions: serializeSteps(newSteps),
        is_baker_mode: !!row.is_baker_mode,
        is_public: false, // Vacuna: los clones son privados por defecto.
        original_author: originalAuthor,
        // share_token intentionally omitted → never inherited.
      })
      .select("id")
      .single();
    if (error) throw new Error("APP-SYS-001: " + error.message);
    return { id: inserted.id };
  });

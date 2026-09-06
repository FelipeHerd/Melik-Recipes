// Extracts an inline ```melik-recipe {...}``` JSON block emitted by the
// Discovery LLM, validates it with Zod, and returns the clean visible text.
import { z } from "zod";
import { STANDARD_CATEGORIES } from "@/lib/categories";

const ingredientSchema = z.object({
  quantity: z
    .union([z.string(), z.number()])
    .transform((v) => String(v ?? "").trim())
    .default(""),
  unit: z.string().trim().max(16).default(""),
  name: z.string().trim().min(1).max(200),
});

const stepSchema = z.object({
  text: z.string().trim().min(1).max(1000),
});

export const recipeDraftSchema = z.object({
  title: z.string().trim().min(1).max(200),
  category: z.string().trim().min(1).max(80),
  emoji: z.string().trim().max(8).default("🍽️"),
  timeMinutes: z.number().int().min(0).max(10000),
  ingredients: z.array(ingredientSchema).min(1).max(20),
  instructions: z.array(stepSchema).min(1).max(20),
  notes: z.string().max(5000).optional().default(""),
});

export type RecipeDraft = z.infer<typeof recipeDraftSchema>;

// Matches ```melik-recipe ...``` fenced blocks (case-insensitive tag).
const BLOCK_RE = /```melik-recipe\s*([\s\S]*?)```/i;

export function extractRecipeDraft(text: string): {
  cleanText: string;
  draft: RecipeDraft | null;
} {
  if (!text) return { cleanText: text ?? "", draft: null };
  const match = text.match(BLOCK_RE);
  if (!match) return { cleanText: text, draft: null };

  const cleanText = text.replace(BLOCK_RE, "").trim();
  const raw = match[1].trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { cleanText, draft: null };
  }

  const result = recipeDraftSchema.safeParse(parsed);
  if (!result.success) return { cleanText, draft: null };

  // Normalise category to one of the standard ones if a close match exists.
  const normalized = { ...result.data };
  const lower = normalized.category.toLowerCase();
  const std = STANDARD_CATEGORIES.find((c) => c.toLowerCase() === lower);
  if (std) normalized.category = std;

  return { cleanText, draft: normalized };
}

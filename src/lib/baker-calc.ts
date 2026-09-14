// Baker's calculator helpers — pure functions, no framework deps.

import type { Ingredient } from "@/lib/recipe-format";

/** Categories that flip ViewRecipeModal into calculator mode. */
const BAKING_KEYWORDS = [
  "pan",
  "panaderia",
  "masa",
  "sourdough",
  "focaccia",
  "baguette",
  "pizza",
  "brioche",
  "croissant",
];

function normalizeCategory(cat: string | null | undefined): string {
  return (cat ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function isBakingCategory(cat: string | null | undefined): boolean {
  const n = normalizeCategory(cat);
  if (!n) return false;
  return BAKING_KEYWORDS.some((k) => n.includes(normalizeCategory(k)));
}

/** Units treated as weight/volume for the "Peso de masa final" total. */
const WEIGHT_UNIT_TO_GRAMS: Record<string, number> = {
  g: 1,
  gr: 1,
  gram: 1,
  gramo: 1,
  gramos: 1,
  kg: 1000,
  ml: 1,
  l: 1000,
  lt: 1000,
  litro: 1000,
  litros: 1000,
};

export function unitToGramFactor(unit: string | null | undefined): number | null {
  const u = (unit ?? "").toLowerCase().trim();
  if (!u) return null;
  return WEIGHT_UNIT_TO_GRAMS[u] ?? null;
}

export function isWeightUnit(unit: string | null | undefined): boolean {
  return unitToGramFactor(unit) !== null;
}

/** Parse the numeric portion of an ingredient quantity ("1,5", "0.5", "2"). Returns null when not numeric. */
export function parseQuantity(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const s = String(raw).trim().replace(",", ".");
  if (!s) return null;
  // Support simple fractions like "1/2"
  if (/^\d+\/\d+$/.test(s)) {
    const [n, d] = s.split("/").map(Number);
    if (d) return n / d;
  }
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Format a scaled quantity for display: trims useless decimals, max 2 decimals. */
export function formatScaledQty(value: number): string {
  if (!Number.isFinite(value)) return "";
  if (value >= 100) return String(Math.round(value));
  const rounded = Math.round(value * 100) / 100;
  const s = rounded.toString();
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
}

/** Weight total in grams for the current scaled ingredients. */
export function currentWeightGrams(
  ingredients: Ingredient[],
  baseQuantities: (number | null)[],
  scale: number,
): number {
  let total = 0;
  for (let i = 0; i < ingredients.length; i++) {
    const base = baseQuantities[i];
    if (base == null) continue;
    const factor = unitToGramFactor(ingredients[i].unit);
    if (factor == null) continue;
    total += base * scale * factor;
  }
  return total;
}

/** Precompute base numeric quantities aligned with the ingredient array (null when non-numeric). */
export function baseQuantitiesFrom(ingredients: Ingredient[]): (number | null)[] {
  return ingredients.map((i) => parseQuantity(i.quantity));
}

const BAKER_KEY_PREFIX = "meliks.baker.";

export function loadBakerScale(recipeId: string): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(BAKER_KEY_PREFIX + recipeId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { scale?: number };
    if (typeof parsed?.scale === "number" && Number.isFinite(parsed.scale) && parsed.scale > 0) {
      return parsed.scale;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function saveBakerScale(recipeId: string, scale: number) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      BAKER_KEY_PREFIX + recipeId,
      JSON.stringify({ scale, updatedAt: Date.now() }),
    );
  } catch {
    /* ignore */
  }
}

export function clearBakerScale(recipeId: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(BAKER_KEY_PREFIX + recipeId);
  } catch {
    /* ignore */
  }
}

// ---------- Baker's Percentage (pure formula) helpers ----------

/** Parse "70", "70%", "1,5" → positive finite number, else null. */
export function parsePercent(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const s = String(raw).trim().replace("%", "").replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function sumPercents(ingredients: Ingredient[]): number {
  let total = 0;
  for (const i of ingredients) {
    const p = parsePercent(i.quantity);
    if (p != null) total += p;
  }
  return total;
}

export function gramsFromPercent(pct: number, totalWeight: number, pTotal: number): number {
  if (pTotal <= 0) return 0;
  return totalWeight * (pct / pTotal);
}

export function totalFromIngredientGrams(grams: number, pct: number, pTotal: number): number {
  if (pct <= 0) return 0;
  return grams * (pTotal / pct);
}

const BAKER_TOTAL_KEY_PREFIX = "meliks.baker.total.";

export function loadBakerTotal(recipeId: string): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(BAKER_TOTAL_KEY_PREFIX + recipeId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { total?: number };
    if (typeof parsed?.total === "number" && Number.isFinite(parsed.total) && parsed.total > 0) {
      return parsed.total;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function saveBakerTotal(recipeId: string, total: number) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      BAKER_TOTAL_KEY_PREFIX + recipeId,
      JSON.stringify({ total, updatedAt: Date.now() }),
    );
  } catch {
    /* ignore */
  }
}

export function clearBakerTotal(recipeId: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(BAKER_TOTAL_KEY_PREFIX + recipeId);
  } catch {
    /* ignore */
  }
}

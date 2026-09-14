// Structured shapes for ingredients and instructions used across the app.
// Tolerant parsers convert legacy plain-text strings (or nulls) into arrays so
// nothing renders as `undefined` and the UI never crashes on old records.

export type Ingredient = { quantity: string; unit: string; name: string };
export type Step = { text: string; imagePath?: string | null; imageUrl?: string | null };

export const UNIT_OPTIONS: string[] = [
  "",
  "gr",
  "kg",
  "ml",
  "l",
  "taza",
  "cda",
  "cdta",
  "unidad",
  "pizca",
  "al gusto",
];
const UNIT_SET = new Set(UNIT_OPTIONS.filter(Boolean).map((u) => u.toLowerCase()));

export const MAX_ROWS = 20;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function coerceString(v: unknown, max = 200): string {
  if (typeof v === "string") return v.trim().slice(0, max);
  if (typeof v === "number") return String(v);
  return "";
}

/** Legacy line → { quantity, unit, name } best-effort. */
function parseIngredientLine(raw: string): Ingredient {
  const line = raw.trim().replace(/^[-•·*]\s*/, "");
  if (!line) return { quantity: "", unit: "", name: "" };
  // "2 tazas harina", "200 gr azúcar", "1/2 cda sal"
  const m = line.match(/^([\d]+(?:[.,/]\d+)?)\s+([A-Za-zÁÉÍÓÚáéíóúñÑ]{1,8})\s+(.+)$/);
  if (m && UNIT_SET.has(m[2].toLowerCase())) {
    return { quantity: m[1], unit: m[2].toLowerCase(), name: m[3].trim() };
  }
  // "2 huevos" (no unit)
  const m2 = line.match(/^([\d]+(?:[.,/]\d+)?)\s+(.+)$/);
  if (m2) return { quantity: m2[1], unit: "", name: m2[2].trim() };
  return { quantity: "", unit: "", name: line };
}

export function parseIngredients(value: unknown): Ingredient[] {
  if (Array.isArray(value)) {
    return value
      .map((v) => {
        if (isObject(v)) {
          return {
            quantity: coerceString(v.quantity, 32),
            unit: coerceString(v.unit, 16),
            name: coerceString(v.name, 200),
          };
        }
        if (typeof v === "string") return parseIngredientLine(v);
        return { quantity: "", unit: "", name: "" };
      })
      .filter((i) => i.name || i.quantity || i.unit);
  }
  if (typeof value === "string" && value.trim()) {
    return value
      .split(/\r?\n|;|,(?![^()]*\))/g)
      .map((s) => s.trim())
      .filter(Boolean)
      .map(parseIngredientLine)
      .filter((i) => i.name || i.quantity || i.unit);
  }
  return [];
}

/** Legacy multiline / numbered text → Step[]. Also extracts [IMG:path|url] markers appended by CSV export. */
function parseStepsFromString(raw: string): Step[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  const byNumber = trimmed
    .split(/(?:^|\n|\s)(?=\d{1,2}[.)-]\s+)/g)
    .map((s) => s.trim())
    .filter(Boolean);
  const src = byNumber.length > 1 ? byNumber : trimmed.split(/\r?\n+/g);
  return src
    .map((s) => s.trim().replace(/^\d{1,2}[.)-]\s*/, ""))
    .filter(Boolean)
    .map((line) => extractImageMarker(line))
    .filter((s) => s.text || s.imagePath || s.imageUrl);
}

/** Pulls a trailing `[IMG:path|url]` (or `[IMG:path]` / `[IMG:|url]`) marker off a step string. */
function extractImageMarker(line: string): Step {
  const m = line.match(/\s*\[IMG:([^\]]*)\]\s*$/);
  if (!m) return { text: line.trim() };
  const text = line.slice(0, m.index).trim();
  const [rawPath = "", rawUrl = ""] = m[1].split("|");
  const imagePath = rawPath.trim() || null;
  const imageUrl = rawUrl.trim() || null;
  return { text, imagePath, imageUrl };
}

export function parseSteps(value: unknown): Step[] {
  if (Array.isArray(value)) {
    return value
      .map((v) => {
        if (isObject(v)) {
          const imagePath = typeof v.imagePath === "string" ? v.imagePath : null;
          return {
            text: coerceString(v.text, 1000),
            imagePath,
            imageUrl: typeof v.imageUrl === "string" ? v.imageUrl : null,
          };
        }
        if (typeof v === "string") return { text: v.trim().slice(0, 1000) } as Step;
        return { text: "" } as Step;
      })
      .filter((s) => s.text || s.imagePath);
  }
  if (typeof value === "string" && value.trim()) return parseStepsFromString(value);
  return [];
}

/** Serialize back to a human-readable string for legacy text columns / CSV. */
export function serializeIngredients(list: Ingredient[]): string {
  return list
    .filter((i) => i.name || i.quantity || i.unit)
    .map((i) => [i.quantity, i.unit, i.name].filter(Boolean).join(" ").trim())
    .join("\n");
}

export function serializeSteps(list: Step[]): string {
  return list
    .filter((s) => s.text)
    .map((s, i) => `${i + 1}. ${s.text}`)
    .join("\n");
}

/** Text used by chef-brain search / previews. */
export function ingredientsToText(list: Ingredient[]): string {
  return serializeIngredients(list);
}

export function stepsToText(list: Step[]): string {
  return list
    .map((s) => s.text)
    .filter(Boolean)
    .join("\n");
}

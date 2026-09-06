import type { Recipe, Step } from "@/lib/recipes-context";
import { serializeIngredients } from "@/lib/recipe-format";

// Neutralize spreadsheet formula injection: if a field starts with =, +, -, @,
// tab, or carriage return, Excel/Sheets may interpret it as a formula (or DDE)
// when the CSV is opened. Prefix with a single quote to force literal text.
// Applied to every exported field regardless of provenance since shared/community
// recipes can carry attacker-controlled text into a victim's export.
function neutralizeFormula(s: string): string {
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

function escape(value: string | number | null | undefined): string {
  let s = value == null ? "" : String(value);
  s = neutralizeFormula(s);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * CSV-only step serializer: keeps the numbered human-readable format and
 * appends a `[IMG:imagePath|imageUrl]` marker per step when an image exists,
 * so the round-trip through import restores the Step[] with its images.
 */
function serializeStepsForCsv(list: Step[]): string {
  return list
    .filter((s) => s.text || s.imagePath || s.imageUrl)
    .map((s, i) => {
      const base = `${i + 1}. ${s.text ?? ""}`.trim();
      if (!s.imagePath && !s.imageUrl) return base;
      const path = (s.imagePath ?? "").replace(/[|\]]/g, "");
      const url = (s.imageUrl ?? "").replace(/[|\]]/g, "");
      return `${base} [IMG:${path}|${url}]`;
    })
    .join("\n");
}

export function recipesToCsv(recipes: Recipe[]): string {
  const headers = [
    "title",
    "category",
    "time_minutes",
    "ingredients",
    "instructions",
    "image_url",
    "created_at",
    "original_author",
  ];
  const lines = [headers.join(",")];
  for (const r of recipes) {
    lines.push(
      [
        escape(r.title),
        escape(r.category),
        escape(r.timeMinutes),
        escape(serializeIngredients(r.ingredients)),
        escape(serializeStepsForCsv(r.instructions)),
        escape(r.imageUrl ?? ""),
        escape(new Date(r.createdAt).toISOString()),
        escape(r.originalAuthor ?? ""),
      ].join(","),
    );
  }
  return lines.join("\r\n");
}

export function downloadRecipesCsv(recipes: Recipe[]) {
  const csv = recipesToCsv(recipes);
  // Prepend BOM for Excel compatibility with UTF-8.
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const today = new Date().toISOString().slice(0, 10);
  const a = document.createElement("a");
  a.href = url;
  a.download = `melik-recipes-${today}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

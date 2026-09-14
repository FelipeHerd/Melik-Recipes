// Helpers to build LLM-ready context from a recipe (invisible injection in the
// current turn; the persisted user message stays clean).

import type { Ingredient, Step } from "@/lib/recipe-format";

export type AttachedRecipe = {
  id: string;
  title: string;
  source: "mine" | "official";
};

export type RecipeForContext = {
  title: string;
  category?: string | null;
  timeMinutes?: number | null;
  ingredients: Ingredient[];
  instructions: Step[];
};

const MAX_CHARS = 2000;

function ingredientLine(i: Ingredient): string {
  const name = (i.name ?? "").trim();
  if (!name) return "";
  const qty = (i.quantity ?? "").trim();
  const unit = (i.unit ?? "").trim();
  if (unit === "%") return `- ${qty}% ${name}`.trim();
  const left = [qty, unit].filter(Boolean).join(" ").trim();
  return left ? `- ${left} ${name}` : `- ${name}`;
}

export function formatRecipeForLLM(recipe: RecipeForContext): string {
  const lines: string[] = [];
  lines.push(`**${recipe.title}**`);
  const meta: string[] = [];
  if (recipe.category) meta.push(recipe.category);
  if (recipe.timeMinutes) meta.push(`${recipe.timeMinutes} min`);
  if (meta.length) lines.push(`_${meta.join(" · ")}_`);
  lines.push("");
  lines.push("Ingredientes:");
  for (const ing of recipe.ingredients) {
    const line = ingredientLine(ing);
    if (line) lines.push(line);
  }
  lines.push("");
  lines.push("Pasos:");
  recipe.instructions.forEach((s, i) => {
    const t = (s.text ?? "").trim();
    if (t) lines.push(`${i + 1}. ${t}`);
  });
  let out = lines.join("\n");
  if (out.length > MAX_CHARS) out = out.slice(0, MAX_CHARS - 3) + "...";
  return out;
}

export function buildUserPromptWithRecipe(userText: string, recipe: RecipeForContext): string {
  const md = formatRecipeForLLM(recipe);
  const question = userText.trim() || "¿Puedes revisarla y darme consejos?";
  return `[Contexto de receta adjunta: "${recipe.title}"]\n${md}\n[Fin del contexto]\n\nPregunta del usuario: ${question}`;
}

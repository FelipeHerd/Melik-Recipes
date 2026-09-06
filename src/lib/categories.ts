export const emojiByCategory: Record<string, string> = {
  "Plato principal": "🍝",
  "Desayuno": "🥞",
  "Entrada": "🥗",
  "Postre": "🍰",
  "Bebida": "🥤",
  "Snack": "🥨",
  "Pan": "🍞",
};

export const STANDARD_CATEGORIES = Object.keys(emojiByCategory);


export function isCustomCategory(category: string | null | undefined): boolean {
  if (!category) return false;
  return !(category in emojiByCategory);
}

export function emojiFor(category: string | null | undefined): string {
  if (!category) return "🍽️";
  return emojiByCategory[category] ?? "🍽️";
}

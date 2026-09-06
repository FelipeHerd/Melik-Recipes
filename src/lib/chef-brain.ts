import type { Recipe } from "./recipes-context";

// ============ Text utilities ============

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[¿¡!?.,;:()"'`]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(s: string): string[] {
  return normalize(s).split(" ").filter(Boolean);
}

const STOPWORDS = new Set([
  "el","la","los","las","un","una","unos","unas","de","del","y","o","u","a","al",
  "en","con","sin","para","por","que","como","es","son","mi","tu","se","lo","le",
  "me","te","muy","ya","si","no","pero","tambien","tampoco","muy","casi","bien",
  "porfa","porfavor","favor","puedes","podrias","quiero","necesito","tengo","hay",
  "voy","vamos","quisiera","ahora","luego","hoy","manana","mañana","cocinar","hacer",
  "preparar","receta","recetas","plato","comida","algo","cosa","ese","esa","esto",
  "eso","aquel","aquella","mas","menos","poco","mucho","favorita","favorito",
]);

function contentTokens(s: string): string[] {
  return tokenize(s).filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

// Damerau-Levenshtein (capped)
function editDistance(a: string, b: string, cap = 3): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1);
      }
      rowMin = Math.min(rowMin, dp[i][j]);
    }
    if (rowMin > cap) return cap + 1;
  }
  return dp[m][n];
}

function fuzzyTokenMatch(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a))) return true;
  const cap = Math.max(1, Math.floor(Math.min(a.length, b.length) / 4));
  return editDistance(a, b, cap) <= cap;
}

// ============ Recipe matching ============

export type RecipeMatch = { recipe: Recipe; score: number };

export function scoreRecipeAgainstQuery(query: string, recipe: Recipe): number {
  const qNorm = normalize(query);
  const tNorm = normalize(recipe.title);
  if (!qNorm) return 0;

  let score = 0;
  if (qNorm === tNorm) score += 100;
  if (qNorm.includes(tNorm) && tNorm.length >= 4) score += 60;
  if (tNorm.includes(qNorm) && qNorm.length >= 4) score += 40;

  const qTokens = contentTokens(query);
  const tTokens = contentTokens(recipe.title);
  let hit = 0;
  for (const tt of tTokens) {
    if (qTokens.some((qt) => fuzzyTokenMatch(qt, tt))) hit++;
  }
  if (tTokens.length > 0) score += (hit / tTokens.length) * 50;
  if (hit === tTokens.length && tTokens.length > 0) score += 20;

  // Category bonus
  if (qNorm.includes(normalize(recipe.category))) score += 8;
  return score;
}

export function findBestRecipe(query: string, recipes: Recipe[], minScore = 25): Recipe | null {
  let best: RecipeMatch | null = null;
  for (const r of recipes) {
    const s = scoreRecipeAgainstQuery(query, r);
    if (!best || s > best.score) best = { recipe: r, score: s };
  }
  return best && best.score >= minScore ? best.recipe : null;
}

export function rankRecipes(query: string, recipes: Recipe[]): RecipeMatch[] {
  return recipes
    .map((r) => ({ recipe: r, score: scoreRecipeAgainstQuery(query, r) }))
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score);
}

// ============ Ingredient extraction ============

const BASE_INGREDIENTS = [
  "tomate","tomates","queso","mozzarella","parmesano","cheddar","huevo","huevos",
  "harina","leche","pollo","arroz","pasta","fideos","cebolla","cebolleta","ajo",
  "albahaca","perejil","cilantro","oregano","romero","tomillo","carne","ternera",
  "res","cerdo","atun","atún","salmon","salmón","pescado","papa","papas","patata",
  "patatas","zanahoria","zanahorias","espinaca","espinacas","lechuga","limon","limón",
  "lima","manzana","manzanas","platano","plátano","banana","avena","mantequilla",
  "margarina","azucar","azúcar","sal","pimienta","aceite","oliva","pan","jamon",
  "jamón","tocino","bacon","yogur","yogurt","crema","nata","chocolate","cacao",
  "vainilla","canela","levadura","polvo de hornear","bicarbonato","miel","nueces",
  "almendras","pasas","fresa","fresas","frambuesa","arandanos","arándanos","maiz",
  "maíz","frijol","frijoles","lentejas","garbanzos","brocoli","brócoli","coliflor",
  "calabacin","calabacín","berenjena","pimiento","champiñon","champiñón","champiñones",
  "agua","caldo","vino","cerveza","salsa de tomate","salsa de soya","soja",
];

let dynamicVocab: Set<string> | null = null;
let dynamicVocabSig = "";

function buildDynamicVocab(recipes: Recipe[]): Set<string> {
  const sig = recipes.map((r) => r.id + ":" + r.ingredients.length).join("|");
  if (dynamicVocab && sig === dynamicVocabSig) return dynamicVocab;
  const v = new Set<string>(BASE_INGREDIENTS.map(normalize));
  for (const r of recipes) {
    const ingText = r.ingredients.map((i) => `${i.quantity} ${i.unit} ${i.name}`).join(" ");
    for (const tok of contentTokens(ingText)) {
      if (tok.length >= 4) v.add(tok);
    }
  }
  dynamicVocab = v;
  dynamicVocabSig = sig;
  return v;
}

export function extractIngredients(text: string, recipes: Recipe[]): string[] {
  const vocab = buildDynamicVocab(recipes);
  const norm = " " + normalize(text) + " ";
  const found = new Set<string>();
  for (const w of vocab) {
    const re = new RegExp(`(?<=\\W)${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=\\W)`, "i");
    if (re.test(norm)) found.add(w);
  }
  return Array.from(found);
}

// ============ Substitutions & conversions ============

const SUBSTITUTIONS: Record<string, string[]> = {
  mantequilla: ["aceite vegetal (3/4 de la cantidad)", "margarina", "puré de aguacate (1:1) para hornear"],
  huevo: ["1 cda de linaza + 3 cdas de agua (reposar 5 min)", "1/4 taza de puré de manzana", "1/2 plátano machacado"],
  leche: ["leche de almendras", "leche de avena", "leche de soya", "agua + 1 cda de mantequilla por taza"],
  azucar: ["miel (usa 3/4 y reduce líquido)", "panela rallada", "azúcar mascabado"],
  harina: ["avena molida", "harina integral (puede quedar más densa)", "mezcla de almendra + maicena"],
  "polvo de hornear": ["1/4 cdita bicarbonato + 1/2 cdita crema tártara por cdita"],
  crema: ["leche evaporada", "yogurt griego", "leche de coco espesa"],
  aceite: ["mantequilla derretida", "puré de manzana en repostería"],
  limon: ["vinagre blanco (mitad de cantidad)", "jugo de lima"],
  ajo: ["1/8 cdita ajo en polvo por diente"],
  cebolla: ["1 cda cebolla en polvo por unidad", "puerro picado"],
  vino: ["caldo + 1 cda de vinagre"],
};

export function findSubstitution(text: string): { for: string; options: string[] } | null {
  const n = normalize(text);
  for (const key of Object.keys(SUBSTITUTIONS)) {
    if (n.includes(key)) return { for: key, options: SUBSTITUTIONS[key] };
  }
  return null;
}

const VOLUME_ML: Record<string, number> = {
  taza: 240, tazas: 240, cup: 240, cups: 240,
  cda: 15, cdas: 15, cucharada: 15, cucharadas: 15,
  cdita: 5, cditas: 5, cucharadita: 5, cucharaditas: 5,
  ml: 1, l: 1000, litro: 1000, litros: 1000,
  onza: 30, onzas: 30, oz: 30,
};
const MASS_G: Record<string, number> = {
  g: 1, gr: 1, gramo: 1, gramos: 1,
  kg: 1000, kilo: 1000, kilos: 1000, kilogramo: 1000, kilogramos: 1000,
  lb: 453.592, libra: 453.592, libras: 453.592,
  oz: 28.3495, onza: 28.3495, onzas: 28.3495,
};

export function tryConvert(text: string): string | null {
  const n = normalize(text);
  const m = n.match(/(\d+(?:[.,]\d+)?)\s*([a-z]+)\s*(?:a|en|to)\s*([a-z]+)/);
  if (!m) return null;
  const value = parseFloat(m[1].replace(",", "."));
  const from = m[2];
  const to = m[3];
  if (from in VOLUME_ML && to in VOLUME_ML) {
    const ml = value * VOLUME_ML[from];
    return `${value} ${from} ≈ ${(ml / VOLUME_ML[to]).toFixed(2)} ${to} (${ml} ml).`;
  }
  if (from in MASS_G && to in MASS_G) {
    const g = value * MASS_G[from];
    return `${value} ${from} ≈ ${(g / MASS_G[to]).toFixed(2)} ${to} (${g.toFixed(0)} g).`;
  }
  return null;
}

// ============ Steps helpers ============

export function getSteps(recipe: Recipe): string[] {
  return recipe.instructions.map((s) => s.text.trim()).filter(Boolean);
}

// ============ Intent detection ============

export type Intent =
  | { type: "greet" }
  | { type: "thanks" }
  | { type: "help" }
  | { type: "list_recipes" }
  | { type: "count_recipes" }
  | { type: "random_recipe" }
  | { type: "open_recipe"; recipe: Recipe }
  | { type: "guide_recipe"; recipe: Recipe }
  | { type: "ingredients_of"; recipe: Recipe }
  | { type: "time_of"; recipe: Recipe }
  | { type: "next_step" }
  | { type: "prev_step" }
  | { type: "repeat_step" }
  | { type: "current_step" }
  | { type: "cancel_guide" }
  | { type: "substitute"; payload: { for: string; options: string[] } }
  | { type: "convert"; result: string }
  | { type: "what_to_cook"; ingredients: string[] }
  | { type: "search_category"; category: string }
  | { type: "unknown"; ingredients: string[] };

export type BrainMemory = {
  activeRecipeId: string | null;
  activeStepIndex: number;
  suggestedRecipeIds: string[];
  mentionedIngredients: string[];
};

function resolveOrdinal(text: string, recipes: Recipe[], suggestedIds: string[]): Recipe | null {
  const n = normalize(text);
  const map: Record<string, number> = {
    primera: 0, primero: 0, "1": 0, uno: 0,
    segunda: 1, segundo: 1, "2": 1, dos: 1,
    tercera: 2, tercero: 2, "3": 2, tres: 2,
    cuarta: 3, cuarto: 3, "4": 3,
  };
  for (const k of Object.keys(map)) {
    if (new RegExp(`\\b${k}\\b`).test(n)) {
      const id = suggestedIds[map[k]];
      if (id) return recipes.find((r) => r.id === id) ?? null;
    }
  }
  if (/\b(esa|ese|aquella|la anterior|esta|este)\b/.test(n) && suggestedIds.length) {
    return recipes.find((r) => r.id === suggestedIds[0]) ?? null;
  }
  return null;
}

export function detectIntent(text: string, recipes: Recipe[], memory: BrainMemory): Intent {
  const n = normalize(text);
  const ingredients = extractIngredients(text, recipes);

  if (/^(hola|holi|buenas|hey|que tal|qué tal|saludos|buenos dias|buenas tardes|buenas noches)\b/.test(n))
    return { type: "greet" };
  if (/^(gracias|muchas gracias|mil gracias|thank|thanks|grax)/.test(n))
    return { type: "thanks" };
  if (/\b(ayuda|que puedes hacer|qué puedes hacer|que sabes hacer|qué sabes hacer|como funciona|cómo funciona|help)\b/.test(n))
    return { type: "help" };

  // Step navigation (requires active recipe)
  if (memory.activeRecipeId) {
    if (/\b(cancelar|salir|parar|dejar|terminar guia|terminar guía|olvidalo|olvídalo)\b/.test(n))
      return { type: "cancel_guide" };
    if (/\b(siguiente|próximo|proximo|listo|hecho|ya esta|ya está|continuar|sigue|next|avanzar)\b/.test(n))
      return { type: "next_step" };
    if (/\b(anterior|atras|atrás|previo|regresa|volver|back)\b/.test(n))
      return { type: "prev_step" };
    if (/\b(repite|repetir|otra vez|de nuevo|repetí|repeti)\b/.test(n))
      return { type: "repeat_step" };
    if (/\b(en que paso|en qué paso|cual era|cuál era|paso actual|donde voy|dónde voy|que sigue|qué sigue)\b/.test(n))
      return { type: "current_step" };
  }

  // Conversion
  const conv = tryConvert(text);
  if (conv) return { type: "convert", result: conv };

  // Substitution
  if (/\b(sustitu|reemplaz|cambiar|en vez de|en lugar de|no tengo|alternativa)\w*/.test(n)) {
    const sub = findSubstitution(text);
    if (sub) return { type: "substitute", payload: sub };
  }

  // List / count
  if (/\b(cuantas|cuántas)\b.*\b(recetas)\b/.test(n) || /\bcuantas tengo\b/.test(n))
    return { type: "count_recipes" };
  if (/\b(lista|listar|mostrar|muestrame|muéstrame|ver|enseñame|enseñame)\b.*\b(recetas|todas)\b/.test(n) ||
      /^(mis recetas|todas las recetas|que recetas tengo|qué recetas tengo)/.test(n))
    return { type: "list_recipes" };

  // Random
  if (/\b(sorpr[eé]ndeme|al azar|aleatorio|cualquier|random|elige tu|tu eliges|tú eliges)\b/.test(n))
    return { type: "random_recipe" };

  // Recipe-targeted intents — try to identify a recipe
  const recipe =
    findBestRecipe(text, recipes, 30) ??
    resolveOrdinal(text, recipes, memory.suggestedRecipeIds);

  if (recipe) {
    if (/\b(ingredientes|que lleva|qué lleva|que tiene|qué tiene|de que es|de qué es)\b/.test(n))
      return { type: "ingredients_of", recipe };
    if (/\b(cuanto tarda|cuánto tarda|cuanto toma|cuánto toma|tiempo|cuanto dura|cuánto dura)\b/.test(n))
      return { type: "time_of", recipe };
    if (/\b(gui|cocin|hagamos|hacemos|prepar|paso a paso|empez|empec|vamos con|ensename a hacer|enséñame a hacer|como se hace|cómo se hace)\w*/.test(n))
      return { type: "guide_recipe", recipe };
    if (/\b(abre|abrir|muestra|mostrar|ver|enseña|enseñame|enséñame|detalle|info)\b/.test(n))
      return { type: "open_recipe", recipe };
    // Bare recipe mention → assume they want to cook it
    return { type: "guide_recipe", recipe };
  }

  // Category search
  const CATS = ["desayuno","postre","entrada","plato principal","bebida","snack","cena","almuerzo"];
  for (const c of CATS) {
    if (n.includes(c)) return { type: "search_category", category: c };
  }

  // Suggest by ingredients
  const allIng = Array.from(new Set([...memory.mentionedIngredients, ...ingredients]));
  if (ingredients.length > 0 ||
      /\b(tengo|sugiere|sugerir|sugerencia|que cocino|qué cocino|que hago|qué hago|que puedo hacer|qué puedo hacer|ideas?|recomienda|recomiendame|recomiéndame)\b/.test(n)) {
    return { type: "what_to_cook", ingredients: allIng };
  }

  return { type: "unknown", ingredients };
}

// ============ Suggestion engine ============

export function suggestByIngredients(ings: string[], recipes: Recipe[], limit = 3): Recipe[] {
  if (recipes.length === 0) return [];
  const scored = recipes.map((r) => {
    const ingText = r.ingredients.map((i) => `${i.quantity} ${i.unit} ${i.name}`).join(" ");
    const ingNorm = normalize(ingText);
    let hits = 0;
    for (const w of ings) if (ingNorm.includes(w)) hits++;
    const score = hits * 100 - r.timeMinutes / 10;
    return { r, hits, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.filter((x) => x.hits > 0).slice(0, limit).map((x) => x.r);
}

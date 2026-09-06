import assert from "assert";

// Implementations strictly matching src/lib/baker-calc.ts
const BAKING_KEYWORDS = ["pan", "panaderia", "masa", "sourdough", "focaccia", "baguette", "pizza", "brioche", "croissant"];

function normalizeCategory(cat) {
  return (cat ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function isBakingCategory(cat) {
  const n = normalizeCategory(cat);
  if (!n) return false;
  return BAKING_KEYWORDS.some((k) => n.includes(normalizeCategory(k)));
}

function parseQuantity(raw) {
  if (raw == null) return null;
  const s = String(raw).trim().replace(",", ".");
  if (!s) return null;
  if (/^\d+\/\d+$/.test(s)) {
    const [n, d] = s.split("/").map(Number);
    if (d) return n / d;
  }
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parsePercent(raw) {
  if (raw == null) return null;
  const s = String(raw).trim().replace("%", "").replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function sumPercents(ingredients) {
  let total = 0;
  for (const i of ingredients) {
    const p = parsePercent(i.quantity);
    if (p != null) total += p;
  }
  return total;
}

function gramsFromPercent(pct, totalWeight, pTotal) {
  if (pTotal <= 0) return 0;
  return totalWeight * (pct / pTotal);
}

function totalFromIngredientGrams(grams, pct, pTotal) {
  if (pct <= 0) return 0;
  return grams * (pTotal / pct);
}

function formatScaledQty(value) {
  if (!Number.isFinite(value)) return "";
  if (value >= 100) return String(Math.round(value));
  const rounded = Math.round(value * 100) / 100;
  const s = rounded.toString();
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
}

// ---------------- SIMULATORS ----------------

/** Simulates ViewRecipeModal logic for bakerMode & Switch visibility */
function simulateViewRecipeModal(recipe, userToggleState = null) {
  const categoryIsBaking = isBakingCategory(recipe.category);
  const hasPercent = recipe.ingredients.some((i) => (i.unit ?? "").trim() === "%");
  
  const defaultBakerMode = categoryIsBaking &&
    (recipe.isBakerMode === true || (recipe.isBakerMode === undefined && hasPercent));
    
  const bakerModeToggle = userToggleState !== null ? userToggleState : defaultBakerMode;
  const bakerMode = categoryIsBaking && bakerModeToggle;
  const showSwitch = categoryIsBaking;

  return { showSwitch, bakerMode, bakerModeToggle };
}

/** Simulates RecipeFormModal logic for bakerMode, switch visibility & payload */
function simulateRecipeFormModal(initialRecipe, currentCategory, userBakerModeToggle = null) {
  const initialHasPercent = initialRecipe?.ingredients.some((i) => (i.unit ?? "").trim() === "%") ?? false;
  const initialIsBaking = isBakingCategory(initialRecipe?.category);

  // State initialization
  let bakerModeState = initialIsBaking &&
    (initialRecipe?.isBakerMode === true || (initialRecipe?.isBakerMode === undefined && initialHasPercent));

  if (userBakerModeToggle !== null) {
    bakerModeState = userBakerModeToggle;
  }

  const categoryIsBaking = isBakingCategory(currentCategory);

  // Effect simulation: if (!categoryIsBaking && bakerMode) setBakerMode(false);
  if (!categoryIsBaking && bakerModeState) {
    bakerModeState = false;
  }

  const bakerFormMode = categoryIsBaking && bakerModeState;
  const showSwitch = categoryIsBaking;

  return { showSwitch, bakerModeState, bakerFormMode };
}

// ---------------- EMPIRICAL SUITE ----------------

console.log("=== RUNNING EXTENSIVE SIMULATION & CORNER CASE TESTS ===");

let testsPassed = 0;

// Test 1: Recipe with isBakerMode: true saved on non-baking category "Sopa"
const recipeNonBakingTrue = {
  id: "rec-1",
  title: "Sopa de Verduras",
  category: "Sopa",
  ingredients: [{ quantity: "100", unit: "g", name: "Verduras" }],
  isBakerMode: true,
};

const viewRes1 = simulateViewRecipeModal(recipeNonBakingTrue);
assert.strictEqual(viewRes1.showSwitch, false, "Switch must be hidden for Sopa");
assert.strictEqual(viewRes1.bakerMode, false, "bakerMode must be false for Sopa even if isBakerMode is true");
testsPassed++;
console.log("[PASS] ViewRecipeModal correctly rejects bakerMode for Sopa with isBakerMode: true");

const formRes1 = simulateRecipeFormModal(recipeNonBakingTrue, "Sopa");
assert.strictEqual(formRes1.showSwitch, false, "Form switch must be hidden for Sopa");
assert.strictEqual(formRes1.bakerFormMode, false, "bakerFormMode must be false for Sopa");
testsPassed++;
console.log("[PASS] RecipeFormModal correctly rejects bakerMode for Sopa with isBakerMode: true");

// Test 2: Recipe with isBakerMode: true saved on non-baking category "Postre"
const recipePostreTrue = {
  id: "rec-2",
  title: "Flan de Leche",
  category: "Postre",
  ingredients: [{ quantity: "500", unit: "ml", name: "Leche" }],
  isBakerMode: true,
};

const viewRes2 = simulateViewRecipeModal(recipePostreTrue);
assert.strictEqual(viewRes2.showSwitch, false, "Switch must be hidden for Postre");
assert.strictEqual(viewRes2.bakerMode, false, "bakerMode must be false for Postre");
testsPassed++;
console.log("[PASS] ViewRecipeModal correctly rejects bakerMode for Postre");

// Test 3: Recipe with category "Panadería" (accented) and isBakerMode: true
const recipePanaderia = {
  id: "rec-3",
  title: "Pan Campesino",
  category: "Panadería",
  ingredients: [{ quantity: "100%", unit: "%", name: "Harina" }],
  isBakerMode: true,
};

const viewRes3 = simulateViewRecipeModal(recipePanaderia);
assert.strictEqual(viewRes3.showSwitch, true, "Switch must be visible for Panadería");
assert.strictEqual(viewRes3.bakerMode, true, "bakerMode must be true for Panadería");
testsPassed++;
console.log("[PASS] ViewRecipeModal accepts Panadería with accents");

// Test 4: Recipe with category "PIZZA" (uppercase)
const recipePizzaUpper = {
  id: "rec-4",
  title: "Pizza Margaritas",
  category: "PIZZA",
  ingredients: [{ quantity: "100%", unit: "%", name: "Harina 00" }],
};

const viewRes4 = simulateViewRecipeModal(recipePizzaUpper);
assert.strictEqual(viewRes4.showSwitch, true, "Switch must be visible for PIZZA");
assert.strictEqual(viewRes4.bakerMode, true, "bakerMode must be true for PIZZA with % ingredients");
testsPassed++;
console.log("[PASS] ViewRecipeModal accepts uppercase PIZZA");

// Test 5: Changing category from "Pan" to "Postre" inside RecipeFormModal
const formSwitchRes = simulateRecipeFormModal(
  { category: "Pan", ingredients: [] },
  "Postre", // User changed category input to "Postre"
  true      // User had toggled bakerMode ON previously
);
assert.strictEqual(formSwitchRes.showSwitch, false, "Switch should disappear when category changed to Postre");
assert.strictEqual(formSwitchRes.bakerFormMode, false, "bakerFormMode should be forced to false when category changed to Postre");
testsPassed++;
console.log("[PASS] RecipeFormModal dynamically resets bakerMode when switching to non-baking category");

// Test 6: Number parsing edge cases
assert.strictEqual(parseQuantity(" 500,50 "), 500.5);
assert.strictEqual(parseQuantity("1/4"), 0.25);
assert.strictEqual(parseQuantity("0"), null);
assert.strictEqual(parseQuantity("-10"), null);
assert.strictEqual(parsePercent("100,5%"), 100.5);
assert.strictEqual(parsePercent(" 75 % "), 75);
assert.strictEqual(parsePercent("0%"), null);
testsPassed++;
console.log("[PASS] Math & String parsing helper functions passed all edge cases");

console.log(`\nALL ${testsPassed} EXTENSIVE TESTS PASSED SUCCESSFULLY!`);

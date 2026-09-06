import assert from "assert";

// Implementation from baker-calc.ts
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

// ---------------- TESTS ----------------

console.log("=== RUNNING EMPIRICAL TESTS FOR M1 ===");

const edgeCaseCategories = [
  // Accents & variations of baking keywords
  { input: "Panadería", expected: true },
  { input: "PANADERÍA", expected: true },
  { input: "Panaderia", expected: true },
  { input: "panaderia", expected: true },
  { input: "PIZZA", expected: true },
  { input: "Pizza Napolitana", expected: true },
  { input: "Focaccia genovese", expected: true },
  { input: "Masa madre", expected: true },
  { input: "Masa de HOJALDRE", expected: true },
  { input: "Pan de masa madre", expected: true },
  { input: "Sourdough Bread", expected: true },
  { input: "BAGUETTE", expected: true },
  { input: "Brioche", expected: true },
  { input: "Croissant", expected: true },
  
  // Non-baking categories
  { input: "Sopa", expected: false },
  { input: "Sopas y Caldos", expected: false },
  { input: "Postre", expected: false },
  { input: "Postres caseros", expected: false },
  { input: "Bebida", expected: false },
  { input: "Entrada", expected: false },
  { input: "Plato principal", expected: false },
  { input: "Snack", expected: false },
  { input: "Ensaladas", expected: false },
  { input: "", expected: false },
  { input: null, expected: false },
  { input: undefined, expected: false },
];

let passCount = 0;
let failCount = 0;

for (const { input, expected } of edgeCaseCategories) {
  const actual = isBakingCategory(input);
  if (actual === expected) {
    console.log(`[PASS] isBakingCategory("${input}") => ${actual}`);
    passCount++;
  } else {
    console.error(`[FAIL] isBakingCategory("${input}") => ${actual}, expected ${expected}`);
    failCount++;
  }
}

// Check formula calculations
const ingredients = [
  { quantity: "100%", unit: "%", name: "Harina de Trigo" },
  { quantity: "70%", unit: "%", name: "Agua" },
  { quantity: "2%", unit: "%", name: "Sal" },
  { quantity: "1%", unit: "%", name: "Levadura" },
];

const pTotal = sumPercents(ingredients);
assert.strictEqual(pTotal, 173, `Expected sumPercents to be 173, got ${pTotal}`);
console.log(`[PASS] sumPercents => ${pTotal}%`);

// Test totalWeight = 1000g
const totalWeight = 1000;
const flourGrams = gramsFromPercent(100, totalWeight, pTotal);
const waterGrams = gramsFromPercent(70, totalWeight, pTotal);
const saltGrams = gramsFromPercent(2, totalWeight, pTotal);
const yeastGrams = gramsFromPercent(1, totalWeight, pTotal);

const sumGrams = flourGrams + waterGrams + saltGrams + yeastGrams;
assert(Math.abs(sumGrams - 1000) < 0.0001, `Expected sum of grams to equal totalWeight 1000, got ${sumGrams}`);
console.log(`[PASS] gramsFromPercent sum => ${sumGrams}g`);

// Test totalFromIngredientGrams
const calculatedTotal = totalFromIngredientGrams(500, 100, pTotal);
assert.strictEqual(calculatedTotal, 865, `Expected totalFromIngredientGrams to be 865, got ${calculatedTotal}`);
console.log(`[PASS] totalFromIngredientGrams(500g flour at 100%) => ${calculatedTotal}g`);

// Test formatScaledQty
assert.strictEqual(formatScaledQty(100), "100");
assert.strictEqual(formatScaledQty(578.0346), "578");
assert.strictEqual(formatScaledQty(11.5606), "11.56");
assert.strictEqual(formatScaledQty(70.50), "70.5");
assert.strictEqual(formatScaledQty(0.5), "0.5");
assert.strictEqual(formatScaledQty(NaN), "");
console.log(`[PASS] formatScaledQty formatting edge cases verified`);

console.log(`\nTEST SUMMARY: ${passCount} passed, ${failCount} failed.`);

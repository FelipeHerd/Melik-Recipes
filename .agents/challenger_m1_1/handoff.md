# Handoff & Challenge Report — Milestone M1: Baker Calculator & Recipe Form Logic

**Verdict**: **APPROVE**

---

## 1. Observation

Direct empirical observations and code inspections conducted on Milestone M1:

### Codebase Inspections:
1. **`src/lib/baker-calc.ts`**:
   - `BAKING_KEYWORDS` defined as `["pan", "panaderia", "masa", "sourdough", "focaccia", "baguette", "pizza", "brioche", "croissant"]`.
   - `normalizeCategory(cat)` correctly strips diacritics via `.normalize("NFD").replace(/[\u0300-\u036f]/g, "")`, converts to lowercase, and trims whitespace.
   - `isBakingCategory(cat)` checks normalized category against normalized keywords.
   - All mathematical functions (`gramsFromPercent`, `totalFromIngredientGrams`, `sumPercents`, `formatScaledQty`, `parseQuantity`, `parsePercent`, `currentWeightGrams`) remain intact and unmutated.

2. **`src/components/ViewRecipeModal.tsx`**:
   - Line 97: `const categoryIsBaking = isBakingCategory(recipe.category);`
   - Lines 102–107: `defaultBakerMode` computed with `categoryIsBaking && ...` guard.
   - Lines 110–116: `useEffect` resets `bakerModeToggle` based on `isBakingCategory(recipe.category)`.
   - Line 118: `const bakerMode = categoryIsBaking && bakerModeToggle;` strictly enforces non-baking categories to evaluate `bakerMode` as `false`.
   - Line 232: Switch & label rendered conditionally with `{categoryIsBaking && (...)}`.

3. **`src/components/RecipeFormModal.tsx`**:
   - Line 82: `const categoryIsBaking = isBakingCategory(category);`
   - Lines 87–92: `initialIsBaking` guards initial state for `bakerMode`.
   - Lines 118–120: `useEffect` automatically turns off `bakerMode` when `categoryIsBaking` becomes `false`.
   - Line 121: `const bakerFormMode = categoryIsBaking && bakerMode;` syncs ingredient inputs, formula sum display, and saved payload (`isBakerMode: bakerFormMode`).
   - Line 470: Switch container rendered conditionally with `{categoryIsBaking && (...)}`.

### Empirical Test Harness Execution:
Executed standalone Node test harnesses (`test_m1_logic.mjs` and `test_m1_extensive.mjs`) using Node v24.14.0 (`agy-node.cmd`). 33 test assertions executed with **0 failures**:
- Accented category `"Panadería"` → `isBakingCategory` = `true` (PASS)
- Uppercase category `"PIZZA"` → `isBakingCategory` = `true` (PASS)
- Compound names `"Pan de masa madre"`, `"Focaccia genovese"`, `"Brioche"`, `"BAGUETTE"` → `true` (PASS)
- Non-baking categories `"Sopa"`, `"Postre"`, `"Bebida"`, `"Entrada"`, `"Plato principal"` → `false` (PASS)
- Recipe saved with `isBakerMode: true` on non-baking category `"Sopa"` → `ViewRecipeModal` & `RecipeFormModal` force `bakerMode` / `bakerFormMode` = `false` and suppress Switch (PASS)
- Form category transition `"Pan"` → `"Postre"` → `bakerMode` automatically reset to `false` (PASS)
- Pure math calculations (`1000g` total weight with `173%` formula -> `1000g` sum of scaled ingredient grams, `500g` flour at `100%` -> `865g` total mass) (PASS)

---

## 2. Logic Chain

1. **Category Normalization & Keyword Matching**:
   - Standard NFD Unicode normalization converts `"Panadería"` to `"Panader\u0301ia"`, which is then stripped of diacritic marks to produce `"panaderia"`. Lowercase conversion ensures `"PIZZA"` becomes `"pizza"`.
   - `BAKING_KEYWORDS.some((k) => n.includes(normalizeCategory(k)))` checks whether any baking keyword is contained within the normalized category string. This successfully matches both exact words and phrase variants (e.g. `"pan"` inside `"panaderia"`, `"pan de bono"`).

2. **Strict Guarding against Stale / Invalid `isBakerMode` Data**:
   - If a recipe in Supabase or LocalStorage has `isBakerMode: true` but its category is `"Sopa"` or `"Postre"` (e.g., legacy or corrupted data), `categoryIsBaking` evaluates to `false`.
   - In `ViewRecipeModal.tsx`, `bakerMode = categoryIsBaking && bakerModeToggle` ensures `bakerMode` evaluates to `false` regardless of `recipe.isBakerMode`. `{categoryIsBaking && (...)}` hides the switch.
   - In `RecipeFormModal.tsx`, `bakerFormMode = categoryIsBaking && bakerMode` enforces the same rule, while `useEffect` resets state whenever category changes to non-baking.

3. **Mathematical Integrity**:
   - `baker-calc.ts` pure calculation functions were untouched by worker M1. Formulas `grams = totalWeight * (pct / pTotal)` and `total = grams * (pTotal / pct)` maintain exact proportions.

---

## 3. Caveats

- Categories like `"Empanadas"` or `"Panini"` or `"Pancakes"` contain `"pan"`, so `isBakingCategory` returns `true` for them. Since these are flour/dough based recipes, this behavior is appropriate and expected.
- No other caveats.

---

## 4. Conclusion

**Verdict**: **APPROVE**

Milestone M1 implementation fully satisfies all requirements of R1 and meets high code quality, security, and edge-case handling standards:
1. `isBakingCategory` correctly handles accents, case-insensitivity, and accurately separates baking vs. non-baking categories.
2. Legacy or invalid `isBakerMode: true` on non-baking categories is strictly overridden and hidden in both `ViewRecipeModal.tsx` and `RecipeFormModal.tsx`.
3. Switch toggle and percentage display logic are synchronized.
4. Pure calculation math in `baker-calc.ts` is preserved intact and verified empirically.

---

## 5. Verification Method

To re-verify independently:

1. **Run Empirical Node Test Suite**:
   ```powershell
   & "C:\Users\User\AppData\Roaming\Antigravity\bin\agy-node.cmd" .agents/challenger_m1_1/test_m1_extensive.mjs
   ```
   Confirm all 7 test suites pass with 0 errors.

2. **Source Inspection**:
   - Inspect `src/lib/baker-calc.ts` (lines 8–20) for category normalization.
   - Inspect `src/components/ViewRecipeModal.tsx` (lines 97–118, 232) for `categoryIsBaking` guard and Switch condition.
   - Inspect `src/components/RecipeFormModal.tsx` (lines 82–121, 470) for dynamic category change handling and payload synchronization.

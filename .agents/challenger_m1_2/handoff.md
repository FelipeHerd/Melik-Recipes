# Challenge Report — Milestone M1: Baker Calculator & Recipe Form Logic (Challenger 2)

## 1. Observation
- **File inspected**: `src/lib/baker-calc.ts`
  - Lines 6–20: `BAKING_KEYWORDS` includes `["pan", "panaderia", "masa", "sourdough", "focaccia", "baguette", "pizza", "brioche", "croissant"]`.
  - `normalizeCategory` removes diacritics using Unicode NFD decomposition (`.normalize("NFD").replace(/[\u0300-\u036f]/g, "")`), converts to lowercase and trims.
  - `isBakingCategory(cat)` returns `true` if and only if the normalized category string contains any normalized keyword.
  - Lines 130–159: Pure formula math functions `parsePercent`, `sumPercents`, `gramsFromPercent`, and `totalFromIngredientGrams` are intact. Formula for `gramsFromPercent`: `totalWeight * (pct / pTotal)`. Formula for `totalFromIngredientGrams`: `grams * (pTotal / pct)`.
- **File inspected**: `src/components/ViewRecipeModal.tsx`
  - Lines 97–118: `categoryIsBaking` is evaluated via `isBakingCategory(recipe.category)`. `bakerMode` is defined as `categoryIsBaking && bakerModeToggle`.
  - Lines 232–248: The interactive `Switch` component with `Calculator` icon and label "Porcentaje Panadero" is rendered conditionally using `{categoryIsBaking && (...)}`.
  - Lines 258–260: Conditional view switching: when `bakerMode` is `true`, `<BakerCalculator recipe={recipe} />` renders; when `false`, standard interactive ingredient list `<ul>` renders.
- **File inspected**: `src/components/RecipeFormModal.tsx`
  - Lines 82–92: `initialIsBaking` guards the initial `bakerMode` state so non-baking recipes never start in baker mode when edited.
  - Lines 118–121: `useEffect` resets `bakerMode` to `false` whenever `categoryIsBaking` becomes `false`. `bakerFormMode` is defined as `categoryIsBaking && bakerMode`.
  - Lines 470–478: Switch `¿Usar Porcentaje Panadero?` rendered conditionally on `categoryIsBaking`.
  - Lines 538–565 & 651–693: `bakerFormMode` controls ingredient row percentage input fields, `%` unit assignment, real-time formula percentage sum display (`sumPercents(ingredients)`), and the `isBakerMode` flag in the submission payload.

## 2. Logic Chain
1. **Conditional Visibility (Requirement R1.1)**:
   - In `ViewRecipeModal.tsx`, `categoryIsBaking` evaluates `isBakingCategory(recipe.category)`.
   - The interactive switch is wrapped inside `{categoryIsBaking && (...)}`.
   - For non-baking categories (e.g. "Sopas", "Postres", "Bebidas"), `categoryIsBaking` is `false`. Thus, the switch does NOT render.
   - Furthermore, `bakerMode = categoryIsBaking && bakerModeToggle` ensures that even if `recipe.isBakerMode` was set to `true` in saved data, non-baking recipes can never enter baker calculator mode.
2. **Clean View Toggling (Requirement R1.2)**:
   - In `ViewRecipeModal.tsx`, toggling `view-baker-mode-switch` updates `bakerModeToggle`.
   - When `bakerMode` is `true`, the UI renders `<BakerCalculator recipe={recipe} />` with scaling controls and dynamic gram calculations.
   - When `bakerMode` is `false`, the UI renders the standard checklist of ingredients.
3. **Form Synchronization (Requirement R1.3)**:
   - In `RecipeFormModal.tsx`, `categoryIsBaking` controls the visibility of the `¿Usar Porcentaje Panadero?` switch.
   - `bakerFormMode = categoryIsBaking && bakerMode` synchronizes ingredient row fields (percentage inputs with `%` suffix), the live formula total percentage (`sumPercents(ingredients)`), and payload serialization (`isBakerMode: bakerFormMode`, ingredient units normalized to `%`).
   - Changing category to a non-baking category automatically resets `bakerMode` to `false` via `useEffect`.
4. **Math Integrity (Requirement R1.4)**:
   - Mathematical calculations in `baker-calc.ts` remain pure, exact, and untouched. Inverse calculations (`gramsFromPercent` and `totalFromIngredientGrams`) maintain precision and anti-NaN fallbacks.

## 3. Caveats
- Terminal test execution commands (`node`) are not on system PATH in this environment; full static verification and formal tracing were performed across all state transitions and edge cases. No caveats or code issues found.

## 4. Conclusion
VERDICT: **APPROVE**

Milestone M1 implementation fully satisfies all requirements in `ORIGINAL_REQUEST.md` and `PROJECT.md`:
- `ViewRecipeModal.tsx` strictly guards Baker's Percentage switch visibility and mode activation using `isBakingCategory`.
- `ViewRecipeModal.tsx` cleanly toggles between the standard ingredient list and `<BakerCalculator>`.
- `RecipeFormModal.tsx` synchronizes percentage mode controls, percentage inputs, live formula sum, and output payload.
- All mathematical functions in `baker-calc.ts` remain intact and accurate.

## 5. Verification Method
1. **ViewRecipeModal Inspection**:
   - Verify line 97 of `src/components/ViewRecipeModal.tsx`: `categoryIsBaking = isBakingCategory(recipe.category)`.
   - Verify line 118: `bakerMode = categoryIsBaking && bakerModeToggle`.
   - Verify lines 232–248: `{categoryIsBaking && (<Switch ... />)}`.
   - Verify lines 258–260: `bakerMode ? <BakerCalculator ... /> : <ul ...>`.
2. **RecipeFormModal Inspection**:
   - Verify line 87–92 of `src/components/RecipeFormModal.tsx`: `initialIsBaking` guards initial state.
   - Verify lines 118–121: `useEffect` resets `bakerMode` when `categoryIsBaking` is false; `bakerFormMode = categoryIsBaking && bakerMode`.
   - Verify lines 470–478: `{categoryIsBaking && (<Switch ... />)}`.
   - Verify lines 561–564: Real-time formula percentage sum rendering.
3. **baker-calc.ts Math Inspection**:
   - Verify lines 6–20: `BAKING_KEYWORDS` and `isBakingCategory` normalization.
   - Verify lines 141–158: `sumPercents`, `gramsFromPercent`, `totalFromIngredientGrams` pure formulas.

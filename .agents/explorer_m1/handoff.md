# Handoff Report — Milestone M1 (Baker Calculator & Recipe Form Logic)

## 1. Observation
- **`src/lib/baker-calc.ts` (lines 6, 16-20)**:
  - `BAKING_KEYWORDS` contains `["pan", "panaderia", "masa", "sourdough", "focaccia", "baguette", "pizza", "brioche", "croissant"]`.
  - `isBakingCategory(cat)` normalizes accents/casing via NFD and tests substring presence against `BAKING_KEYWORDS`.
  - Pure calculation formulas (`gramsFromPercent`, `totalFromIngredientGrams`, `sumPercents`, `formatScaledQty`) are implemented without framework dependencies.
- **`src/components/ViewRecipeModal.tsx` (lines 96-100)**:
  - Currently evaluates `bakerMode = recipe.isBakerMode === true || (recipe.isBakerMode === undefined && isBakingCategory(recipe.category) && hasPercent);`.
  - Does NOT check `isBakingCategory(recipe.category)` before evaluating `recipe.isBakerMode === true`.
  - Lacks an interactive switch/toggle control for users to turn baker percentage mode ON/OFF when viewing a baking recipe.
- **`src/components/RecipeFormModal.tsx` (lines 82-83, 109-112, 461-469)**:
  - Uses `const categoryIsBaking = isBakingCategory(category);` to conditionally render the baker percentage switch block.
  - Controls `bakerFormMode = categoryIsBaking && bakerMode`, updating ingredient inputs and formula total percentage simultaneously.
  - Initializes `bakerMode` with `initial?.isBakerMode ?? false`, which could evaluate to `false` for undefined recipes or `true` for non-baking recipes if `isBakerMode` was manually set.

## 2. Logic Chain
1. **Observation 1 (`baker-calc.ts`)**: `isBakingCategory` correctly identifies bread/baking categories using NFD normalization and keyword substring matching.
2. **Observation 2 (`ViewRecipeModal.tsx`)**: In `ViewRecipeModal.tsx`, if `recipe.isBakerMode` was set to `true`, `bakerMode` currently evaluates to `true` regardless of `recipe.category`. Placing `categoryIsBaking = isBakingCategory(recipe.category)` as a prerequisite for `bakerMode` ensures non-baking recipes never enter baker mode. Adding an interactive `Switch` component bound to `bakerModeToggle` state fulfills the requirement for users to toggle baker mode ON/OFF while viewing a baking recipe.
3. **Observation 3 (`RecipeFormModal.tsx`)**: `RecipeFormModal.tsx` already uses `categoryIsBaking` to guard the switch UI, but updating `useState` initialization to check `initialIsBaking` ensures strict consistency when editing existing recipes. `bakerFormMode` toggles percentage inputs and formula calculation together.
4. **Conclusion**: Modifying `ViewRecipeModal.tsx` and `RecipeFormModal.tsx` according to the step-by-step guide in `analysis.md` resolves all Requirement R1 conditions without modifying `baker-calc.ts` math.

## 3. Caveats
- No caveats.

## 4. Conclusion
The implementation plan for Milestone M1 is fully specified and documented in `analysis.md`. The Worker can execute the code modifications directly in `src/components/ViewRecipeModal.tsx` and `src/components/RecipeFormModal.tsx` while keeping `src/lib/baker-calc.ts` intact.

## 5. Verification Method
1. **Manual / Visual Verification**:
   - Open a recipe with category "Pan", "Focaccia", or "Pizza" in `ViewRecipeModal.tsx`:
     - Verify the "Porcentaje Panadero" switch is visible next to "Ingredientes".
     - Toggle the switch OFF: verify standard ingredients list with checkboxes is displayed.
     - Toggle the switch ON: verify `BakerCalculator` is displayed with total weight input and gram calculations.
   - Open a recipe with category "Ensaladas" or "Postres" in `ViewRecipeModal.tsx`:
     - Verify the "Porcentaje Panadero" switch is NOT visible and standard ingredients list is displayed.
   - Open `RecipeFormModal.tsx` and enter category "Focaccia":
     - Verify "¿Usar Porcentaje Panadero?" switch appears.
     - Toggle ON: verify percentage input fields (`%`) and total formula `%` appear.
     - Change category to "Sopas": verify switch disappears and baker mode turns OFF automatically.
2. **Build Verification**:
   - Run `npm run build` (or `npx vite build`) to ensure 0 TypeScript or bundling errors.

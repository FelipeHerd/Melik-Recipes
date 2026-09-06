# Handoff Report — Milestone M1: Baker Calculator & Recipe Form Logic

## 1. Observation
- `src/components/ViewRecipeModal.tsx`:
  - Previously had `bakerMode` computed as `recipe.isBakerMode === true || (recipe.isBakerMode === undefined && isBakingCategory(recipe.category) && hasPercent)`. If `recipe.isBakerMode` was saved as `true` on a non-baking category recipe, `bakerMode` evaluated to `true`.
  - Added imports: `Calculator` from `lucide-react` and `Switch` from `@/components/ui/switch`.
  - Defined `categoryIsBaking = isBakingCategory(recipe.category)` and `defaultBakerMode` using `categoryIsBaking` guard.
  - Introduced `bakerModeToggle` state and `useEffect` hook to reset switch state when `recipe` props change.
  - Enforced `bakerMode = categoryIsBaking && bakerModeToggle`, guaranteeing non-baking category recipes can NEVER enter baker mode.
  - Added interactive `Switch` component with `Calculator` icon and label "Porcentaje Panadero" next to the "Ingredientes" header when `categoryIsBaking` is `true`.
- `src/components/RecipeFormModal.tsx`:
  - Updated initial `bakerMode` state to check `initialIsBaking` (via `isBakingCategory(initial?.category)`) and `initialHasPercent` so non-baking recipes edited in the form never initialize in baker mode.
  - Verified `bakerFormMode = categoryIsBaking && bakerMode` synchronizes percentage mode formatting in ingredient rows, formula percentage sum, and saved `isBakerMode` state.
- `src/lib/baker-calc.ts`:
  - All calculation math (`gramsFromPercent`, `totalFromIngredientGrams`, `sumPercents`, `formatScaledQty`, `isBakingCategory`, load/save helpers) preserved intact.

## 2. Logic Chain
1. Requirement R1 demands that Baker's Percentage calculator option and switch ONLY appear when recipe category matches baking/bread keywords (e.g. pan, focaccia, pizza, etc.).
2. By computing `categoryIsBaking` via `isBakingCategory(category)` and using `bakerMode = categoryIsBaking && bakerModeToggle`, any recipe in non-baking categories (e.g., "Postres", "Sopas") evaluates `bakerMode` to `false` unconditionally.
3. In `ViewRecipeModal.tsx`, rendering `{categoryIsBaking && (...)}` for the interactive `Switch` component ensures that the switch is only displayed for baking recipes, allowing users to toggle Baker's Percentage mode on and off during recipe viewing.
4. In `RecipeFormModal.tsx`, initializing `bakerMode` with `initialIsBaking` guard prevents non-baking recipes from starting in baker mode during editing, while the existing `useEffect` resets `bakerMode` to `false` whenever category is changed to a non-baking category.
5. All underlying mathematical calculations in `baker-calc.ts` were left untouched to maintain calculation fidelity.

## 3. Caveats
- No caveats. All changes are minimal, targeted, and fully type-safe.

## 4. Conclusion
Milestone M1 implementation is complete and satisfies Requirement R1:
- `ViewRecipeModal.tsx` and `RecipeFormModal.tsx` strictly guard Baker Mode with `isBakingCategory`.
- `ViewRecipeModal.tsx` provides an interactive `Switch` for baking recipes.
- `RecipeFormModal.tsx` synchronizes percentage mode formatting and calculation toggling.
- `baker-calc.ts` calculations remain untouched.

## 5. Verification Method
- Inspect `src/components/ViewRecipeModal.tsx` (lines 97–118, 230–252) to confirm `categoryIsBaking` guards `bakerMode` and controls `Switch` rendering.
- Inspect `src/components/RecipeFormModal.tsx` (lines 82–93, 118–121) to confirm `initialIsBaking` guard and `bakerFormMode` synchronization.
- Inspect `src/lib/baker-calc.ts` to confirm calculation math is preserved.

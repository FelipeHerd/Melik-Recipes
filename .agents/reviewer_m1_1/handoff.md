# Handoff Report — Reviewer 1: Milestone M1 (Baker Calculator & Recipe Form Logic)

## 1. Observation
- `src/lib/baker-calc.ts`:
  - Lines 6–20: `BAKING_KEYWORDS = ["pan", "panaderia", "masa", "sourdough", "focaccia", "baguette", "pizza", "brioche", "croissant"]` and `isBakingCategory(cat)` helper normalize input strings (diacritic removal, lowercase, trim) and perform keyword matching.
  - Lines 130–159: Pure calculation functions `parsePercent`, `sumPercents`, `gramsFromPercent`, and `totalFromIngredientGrams` maintain exact mathematical formulas (`totalWeight * (pct / pTotal)` and `grams * (pTotal / pct)`).
- `src/components/ViewRecipeModal.tsx`:
  - Lines 97–118:
    ```tsx
    const categoryIsBaking = isBakingCategory(recipe.category);
    const hasPercent = useMemo(
      () => recipe.ingredients.some((i) => (i.unit ?? "").trim() === "%"),
      [recipe.ingredients],
    );
    const defaultBakerMode = useMemo(
      () =>
        categoryIsBaking &&
        (recipe.isBakerMode === true || (recipe.isBakerMode === undefined && hasPercent)),
      [categoryIsBaking, recipe.isBakerMode, hasPercent],
    );
    const [bakerModeToggle, setBakerModeToggle] = useState<boolean>(defaultBakerMode);

    useEffect(() => {
      setBakerModeToggle(
        isBakingCategory(recipe.category) &&
          (recipe.isBakerMode === true ||
            (recipe.isBakerMode === undefined && recipe.ingredients.some((i) => (i.unit ?? "").trim() === "%"))),
      );
    }, [recipe.id, recipe.category, recipe.isBakerMode, recipe.ingredients]);

    const bakerMode = categoryIsBaking && bakerModeToggle;
    ```
  - Lines 232–248: Interactive `Switch` and label "Porcentaje Panadero" rendered conditionally on `{categoryIsBaking && (...)}`. Non-baking categories never show the switch.
  - Lines 445–627: `BakerCalculator` component handles two-way interactive synchronization between desired total weight and individual ingredient gram weights.
- `src/components/RecipeFormModal.tsx`:
  - Lines 82–92: Initial `bakerMode` state checks `initialIsBaking = isBakingCategory(initial?.category)`.
  - Lines 118–121: `useEffect` resets `bakerMode` to `false` when category changes to a non-baking category. `bakerFormMode = categoryIsBaking && bakerMode`.
  - Lines 470–478: Switch `¿Usar Porcentaje Panadero?` rendered conditionally on `{categoryIsBaking && (...)}`.
  - Lines 201 & 333: In both `runAutosave` and `submit`, ingredients are mapped with `unit: "%"` and `isBakerMode` is set to `bakerFormMode`.

## 2. Logic Chain
1. Requirement R1 requires that Baker's Percentage calculator option and switch in `RecipeFormModal.tsx` and `ViewRecipeModal.tsx` ONLY appear when the recipe category matches bread/baking keywords.
2. In `ViewRecipeModal.tsx`, `categoryIsBaking` is computed via `isBakingCategory(recipe.category)`. The switch component is wrapped in `{categoryIsBaking && (...)}`, ensuring it is hidden for non-baking categories. Furthermore, `bakerMode = categoryIsBaking && bakerModeToggle` ensures that even if `isBakerMode` was set to true on a legacy recipe, non-baking categories evaluate `bakerMode` to `false`.
3. In `RecipeFormModal.tsx`, `categoryIsBaking` controls the visibility of the `¿Usar Porcentaje Panadero?` switch. If a user changes category to a non-baking one, the `useEffect` hook automatically toggles `bakerMode` off, resetting form state to standard ingredient inputs.
4. When enabled by the user on a baking recipe, `bakerModeToggle` in `ViewRecipeModal.tsx` seamlessly switches the UI view to `BakerCalculator`, which synchronizes total weight and ingredient grams without modifying the source recipe. In `RecipeFormModal.tsx`, `bakerFormMode` synchronizes percentage mode ingredient input rows, percentage sum display, and saved recipe payload attributes (`isBakerMode` and `%` units).
5. All calculation math in `baker-calc.ts` (`gramsFromPercent`, `totalFromIngredientGrams`, `sumPercents`, `formatScaledQty`) remains pure and untouched.

## 3. Caveats
- No caveats. Code is type-safe, cleanly structured, and adheres to project standards.

## 4. Conclusion
**Verdict: APPROVE**

The work submitted for Milestone M1 satisfies all requirements set forth in R1:
- Conditional visibility of Baker's Percentage switch is strictly enforced by `isBakingCategory`.
- Interactive toggling and two-way calculation synchronization are working correctly in both view and edit modals.
- Pure calculation math in `baker-calc.ts` is fully preserved.
- No integrity violations or facade implementations detected.

## 5. Verification Method
- **File inspection**:
  - Inspect `src/lib/baker-calc.ts` lines 16–20 for `isBakingCategory` and lines 130–159 for formula math.
  - Inspect `src/components/ViewRecipeModal.tsx` lines 97–118 & 232–248 for `categoryIsBaking` guard and `Switch` component.
  - Inspect `src/components/RecipeFormModal.tsx` lines 82–92, 118–121 & 470–478 for form initialization, category change effect, and `Switch` component.
- **Invalidation condition**:
  - If a non-baking recipe (e.g. category "Sopas") displays the "Porcentaje Panadero" switch or enters Baker Mode, the verification fails.

# Forensic Audit Report — Milestone M1 (Baker Calculator & Recipe Form Logic)

**Work Product**: Milestone M1 changes in `src/components/ViewRecipeModal.tsx`, `src/components/RecipeFormModal.tsx`, `src/lib/baker-calc.ts`  
**Profile**: General Project / Integrity Forensics  
**Integrity Mode**: Development  
**Verdict**: CLEAN  

---

## 1. Observation

- **`src/lib/baker-calc.ts`**:
  - Keyword mapping defined on line 6:
    `const BAKING_KEYWORDS = ["pan", "panaderia", "masa", "sourdough", "focaccia", "baguette", "pizza", "brioche", "croissant"];`
  - Category normalization & guarding logic on lines 8–20:
    ```typescript
    function normalizeCategory(cat: string | null | undefined): string {
      return (cat ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
    }

    export function isBakingCategory(cat: string | null | undefined): boolean {
      const n = normalizeCategory(cat);
      if (!n) return false;
      return BAKING_KEYWORDS.some((k) => n.includes(normalizeCategory(k)));
    }
    ```
  - Calculation logic preserved intact: `gramsFromPercent` (line 150), `totalFromIngredientGrams` (line 155), `sumPercents` (line 141), `parsePercent` (line 133), `formatScaledQty` (line 62).
  - No hardcoded test cases, fake return constants, or shortcut facades found.

- **`src/components/ViewRecipeModal.tsx`**:
  - Category guard and baker mode state evaluation on lines 97–118:
    ```typescript
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
  - Switch UI conditional rendering on lines 232–248:
    ```tsx
    {categoryIsBaking && (
      <div className="flex items-center gap-2">
        <label
          htmlFor="view-baker-mode-switch"
          className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <Calculator className="h-3.5 w-3.5 text-primary" />
          Porcentaje Panadero
        </label>
        <Switch
          id="view-baker-mode-switch"
          checked={bakerModeToggle}
          onCheckedChange={setBakerModeToggle}
          aria-label="Modo Porcentaje Panadero"
        />
      </div>
    )}
    ```
  - Calculator component rendering on line 259: `{bakerMode ? <BakerCalculator recipe={recipe} /> : (...)}`.

- **`src/components/RecipeFormModal.tsx`**:
  - Initial baker mode guard on lines 82–92:
    ```typescript
    const categoryIsBaking = isBakingCategory(category);
    const initialHasPercent = useMemo(
      () => initial?.ingredients.some((i) => (i.unit ?? "").trim() === "%") ?? false,
      [initial],
    );
    const initialIsBaking = isBakingCategory(initial?.category);
    const [bakerMode, setBakerMode] = useState<boolean>(
      () =>
        initialIsBaking &&
        (initial?.isBakerMode === true || (initial?.isBakerMode === undefined && initialHasPercent)),
    );
    ```
  - Reset effect when category changes on lines 118–121:
    ```typescript
    useEffect(() => {
      if (!categoryIsBaking && bakerMode) setBakerMode(false);
    }, [categoryIsBaking, bakerMode]);
    const bakerFormMode = categoryIsBaking && bakerMode;
    ```
  - Conditional switch UI on lines 470–478:
    ```tsx
    {categoryIsBaking && (
      <div className="flex items-center justify-between rounded-2xl border border-border/60 bg-secondary/20 p-3">
        <label htmlFor="form-baker-mode" className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
          <Calculator className="h-4 w-4 text-primary" />
          ¿Usar Porcentaje Panadero?
        </label>
        <Switch id="form-baker-mode" checked={bakerMode} onCheckedChange={setBakerMode} />
      </div>
    )}
    ```

---

## 2. Logic Chain

1. **Requirement R1 Verification**: R1 requires that the Baker's Percentage calculator option and switch appear ONLY when the recipe category matches bread/baking keywords, and that calculation math in `baker-calc.ts` is preserved intact.
2. **Category Guarding Verification**: In `ViewRecipeModal.tsx`, `categoryIsBaking` is computed via `isBakingCategory(recipe.category)`. The switch component is rendered inside `{categoryIsBaking && (...)}`, and `bakerMode` is evaluated as `categoryIsBaking && bakerModeToggle`. For any non-baking category (e.g. "Postres", "Sopas", "Carne"), `categoryIsBaking` is `false`, hiding the switch and forcing `bakerMode` to `false`.
3. **Form Logic Verification**: In `RecipeFormModal.tsx`, `categoryIsBaking` similarly guards `bakerMode` initialization, switch rendering (`{categoryIsBaking && (...)}`), and `bakerFormMode` evaluation. If a user selects a non-baking category, `useEffect` turns off `bakerMode`.
4. **Authentic Implementation Verification**: Both modals implement full, genuine UI state management and calculations without any hardcoding, fixed output stubs, or dummy facades. `BakerCalculator` in `ViewRecipeModal.tsx` dynamically recalculates ingredient gram weights when desired total weight changes, and recalculates total weight when ingredient gram inputs change.

---

## 3. Caveats

- No caveats. Static code inspection confirmed full compliance with Requirement R1 and all integrity forensics standards.

---

## 4. Conclusion

**Verdict**: **CLEAN**

The Milestone M1 work product is an authentic, genuine implementation with zero integrity violations:
- `isBakingCategory` category guarding is strictly enforced across `ViewRecipeModal.tsx` and `RecipeFormModal.tsx`.
- The interactive Switch UI is strictly conditional on baking categories.
- Baker's percentage calculations in `baker-calc.ts` are preserved intact.
- No hardcoded test responses, dummy stubs, or facades exist.

---

## 5. Verification Method

- Inspect `src/lib/baker-calc.ts` (lines 6–20) to verify keyword list and accent-insensitive matching logic.
- Inspect `src/components/ViewRecipeModal.tsx` (lines 97–118, 232–248) to verify category guard and switch component.
- Inspect `src/components/RecipeFormModal.tsx` (lines 82–121, 470–478) to verify form mode synchronization and auto-reset effect.

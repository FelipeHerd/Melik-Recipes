# Analysis Guide — Milestone M1: Baker Calculator & Recipe Form Logic

## Executive Summary
This document outlines the investigation findings and precise step-by-step implementation guide for Milestone M1. Milestone M1 satisfies Requirement R1 by enforcing strict baking category guards on the Baker's Percentage switch and calculator in both `RecipeFormModal.tsx` and `ViewRecipeModal.tsx`, introducing an interactive view toggle in `ViewRecipeModal.tsx`, synchronizing the form inputs and calculator mode in `RecipeFormModal.tsx`, and preserving the pure calculation functions in `baker-calc.ts`.

---

## 1. Target Files & Key Functions

| File | Purpose | Key Functions / State |
|---|---|---|
| `src/lib/baker-calc.ts` | Pure math calculations & category detection | `isBakingCategory`, `sumPercents`, `gramsFromPercent`, `totalFromIngredientGrams`, `formatScaledQty` |
| `src/components/ViewRecipeModal.tsx` | Viewing modal for recipes | `bakerMode`, `categoryIsBaking`, `bakerModeToggle`, `<BakerCalculator />` |
| `src/components/RecipeFormModal.tsx` | Creation/edit modal for recipes | `categoryIsBaking`, `bakerMode`, `bakerFormMode`, `<Switch />` |

---

## 2. Findings & Discrepancies

### A. `ViewRecipeModal.tsx` (Lines 96-100)
- **Current Issue 1**: `bakerMode` was calculated as `recipe.isBakerMode === true || (recipe.isBakerMode === undefined && isBakingCategory(recipe.category) && hasPercent)`. If `recipe.isBakerMode` was saved as `true`, it evaluated to `true` even if `recipe.category` was NOT a baking category.
- **Current Issue 2**: Users viewing a baking recipe had no interactive switch/toggle in `ViewRecipeModal.tsx` to switch between standard checkable ingredients list and the Baker Calculator.

### B. `RecipeFormModal.tsx` (Lines 82-83, 109-112, 461-469)
- **Current State**: `categoryIsBaking = isBakingCategory(category)` controls switch visibility and `bakerFormMode`.
- **Improvement**: Initial `bakerMode` state should account for `initialIsBaking` so non-baking recipes edited in the modal never initialize in baker mode.

### C. `baker-calc.ts`
- **Current State**: All pure helper functions and `BAKING_KEYWORDS` match specification.
- **Action**: Preserve intact without modifying calculation math.

---

## 3. Worker Implementation Guide

### Step 1: Update `src/components/ViewRecipeModal.tsx`

1. **Imports**:
   - Add `Calculator` to the `lucide-react` import list (line 4).
   - Add `import { Switch } from "@/components/ui/switch";` (around line 18).

2. **State & Logic (Lines 96-100)**:
   Replace lines 96-100 with:
   ```tsx
   const categoryIsBaking = isBakingCategory(recipe.category);
   const hasPercent = useMemo(
     () => recipe.ingredients.some((i) => (i.unit ?? "").trim() === "%"),
     [recipe.ingredients],
   );
   const defaultBakerMode = useMemo(
     () => categoryIsBaking && (recipe.isBakerMode === true || (recipe.isBakerMode === undefined && hasPercent)),
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

3. **UI Toggle Render (Lines 210-216)**:
   In the "Ingredientes" section, replace:
   ```tsx
   <h3 className="font-display text-lg font-semibold">Ingredientes</h3>
   <p className="mt-0.5 text-xs text-muted-foreground">
     {bakerMode
       ? "Ajusta el peso total o los gramos de un ingrediente y el resto se recalcula."
       : "Marca lo que ya tengas listo"}
   </p>
   ```
   With:
   ```tsx
   <div className="flex items-center justify-between gap-2">
     <h3 className="font-display text-lg font-semibold">Ingredientes</h3>
     {categoryIsBaking && (
       <div className="flex items-center gap-2">
         <label htmlFor="view-baker-mode-switch" className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
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
   </div>
   <p className="mt-0.5 text-xs text-muted-foreground">
     {bakerMode
       ? "Ajusta el peso total o los gramos de un ingrediente y el resto se recalcula."
       : "Marca lo que ya tengas listo"}
   </p>
   ```

---

### Step 2: Update `src/components/RecipeFormModal.tsx`

1. **State Initialization (Lines 82-84)**:
   Replace line 83 (`const [bakerMode, setBakerMode] = useState<boolean>(initial?.isBakerMode ?? false);`):
   ```tsx
   const categoryIsBaking = isBakingCategory(category);
   const initialHasPercent = useMemo(
     () => initial?.ingredients.some((i) => (i.unit ?? "").trim() === "%") ?? false,
     [initial],
   );
   const initialIsBaking = isBakingCategory(initial?.category);
   const [bakerMode, setBakerMode] = useState<boolean>(
     () => initialIsBaking && (initial?.isBakerMode === true || (initial?.isBakerMode === undefined && initialHasPercent))
   );
   ```

2. **Verify Toggle Synchronization**:
   Ensure `bakerFormMode = categoryIsBaking && bakerMode` continues to drive both ingredient percentage input formatting and formula percentage totals together.

---

### Step 3: Preserve `src/lib/baker-calc.ts`
- Retain all calculation helpers (`isBakingCategory`, `gramsFromPercent`, `totalFromIngredientGrams`, `sumPercents`, `formatScaledQty`, `loadBakerTotal`, `saveBakerTotal`, `clearBakerTotal`) without code changes.

---

## 4. Verification Checklist for Implementer
- [ ] Non-baking category recipes (e.g. "Postres", "Sopas") do NOT show the Baker switch in `RecipeFormModal.tsx` or `ViewRecipeModal.tsx`.
- [ ] In `ViewRecipeModal.tsx`, `bakerMode` checks `isBakingCategory(recipe.category)` first.
- [ ] Users viewing a baking recipe in `ViewRecipeModal.tsx` can toggle Baker Mode ON and OFF using the switch in the ingredients header.
- [ ] In `RecipeFormModal.tsx`, toggling Baker Mode ON/OFF switches both ingredient inputs and formula total calculation together.
- [ ] All Baker Calculator math functions remain unchanged in `baker-calc.ts`.

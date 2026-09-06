## 2026-08-13T15:14:25Z
You are Explorer for Milestone M1 (Baker Calculator & Recipe Form Logic).
Your working directory is: c:/Users/User/Desktop/El Peque/Melik/Melik Recipes/v2/v2_Melik Recipes/.agents/explorer_m1

Please read:
- c:/Users/User/Desktop/El Peque/Melik/Melik Recipes/v2/v2_Melik Recipes/.agents/ORIGINAL_REQUEST.md
- c:/Users/User/Desktop/El Peque/Melik/Melik Recipes/v2/v2_Melik Recipes/PROJECT.md

Requirements for R1 / Milestone M1:
1. Ensure the baker's percentage calculator option and switch in `RecipeFormModal.tsx` and `ViewRecipeModal.tsx` ONLY appear when the recipe category matches bread/baking keywords (e.g. pan, focaccia, pizza, etc.). Use `isBakingCategory` from `baker-calc.ts`.
2. In `ViewRecipeModal.tsx`:
   - `bakerMode` MUST check `isBakingCategory(recipe.category)` before evaluating `recipe.isBakerMode`.
   - Add an interactive switch or toggle in `ViewRecipeModal.tsx` for users to toggle baker percentage view and calculator ON/OFF when viewing a baking recipe.
3. In `RecipeFormModal.tsx`:
   - When enabled by the user, both baker percentage mode and the calculator toggle together.
4. Preserve existing baker calculator math in `baker-calc.ts`.

Investigate the exact lines of code in `RecipeFormModal.tsx`, `ViewRecipeModal.tsx`, and `baker-calc.ts`, and write a detailed step-by-step implementation guide for the Worker.
Write your analysis to `c:/Users/User/Desktop/El Peque/Melik/Melik Recipes/v2/v2_Melik Recipes/.agents/explorer_m1/analysis.md` and handoff report to `handoff.md`.
Send a message back to parent when completed.

## 2026-08-13T15:18:47Z
Task for Milestone M1 (Baker Calculator & Recipe Form Logic):
1. Update `src/components/ViewRecipeModal.tsx`:
   - Import `Calculator` from `lucide-react` and `Switch` from `@/components/ui/switch`.
   - Update `categoryIsBaking = isBakingCategory(recipe.category)`.
   - Guard `bakerMode` with `categoryIsBaking`. Non-baking recipes must NEVER enter baker mode.
   - Add interactive `Switch` component next to "Ingredientes" header when `categoryIsBaking` is true, allowing users to toggle baker mode ON and OFF in view mode.
2. Update `src/components/RecipeFormModal.tsx`:
   - Ensure initial `bakerMode` state uses `initialIsBaking` and `categoryIsBaking` guards.
   - Synchronize baker percentage mode and calculator toggle.
3. Preserve all calculation math in `src/lib/baker-calc.ts`.
4. Run build verification (e.g. `npx tsc --noEmit` or `npm run build`) and document the result.
5. Write your implementation summary and handoff report to `c:/Users/User/Desktop/El Peque/Melik/Melik Recipes/v2/v2_Melik Recipes/.agents/worker_m1/handoff.md`.
Send a message back to parent when completed.

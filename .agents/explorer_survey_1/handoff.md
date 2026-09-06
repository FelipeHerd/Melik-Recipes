# Handoff Report — Explorer Survey 1 (R1 & R2)

**Agent ID**: `explorer_survey_1`  
**Working Directory**: `c:/Users/User/Desktop/El Peque/Melik/Melik Recipes/v2/v2_Melik Recipes/.agents/explorer_survey_1`  
**Target Requirements**: R1 (Baker Calculator & Recipe Form Logic) and R2 (Melik+ Paywall & Kiko Voice Call UX)  

---

## 1. Observation

### R1 Observations
1. **File `src/lib/baker-calc.ts` (lines 6–20)**:
   - `BAKING_KEYWORDS = ["pan", "panaderia", "masa", "sourdough", "focaccia", "baguette", "pizza", "brioche", "croissant"]`
   - `isBakingCategory(cat)` normalizes accents via NFD and checks keyword inclusion.
   - Pure math helpers (`unitToGramFactor`, `parseQuantity`, `formatScaledQty`, `gramsFromPercent`, `totalFromIngredientGrams`) are pure and fully functional.
2. **File `src/components/RecipeFormModal.tsx` (lines 82, 109-112, 461-469)**:
   - `categoryIsBaking` correctly controls rendering of `¿Usar Porcentaje Panadero?` switch.
   - Effect clears `bakerMode` if category changes to a non-baking category.
3. **File `src/components/ViewRecipeModal.tsx` (lines 96-99)**:
   - Verbatim code:
     ```typescript
     const hasPercent = recipe.ingredients.some((i) => (i.unit ?? "").trim() === "%");
     const bakerMode =
       recipe.isBakerMode === true ||
       (recipe.isBakerMode === undefined && isBakingCategory(recipe.category) && hasPercent);
     ```
   - **Discovered Bug**: When `recipe.isBakerMode` is `true`, `bakerMode` evaluates to `true` REGARDLESS of `recipe.category`. Non-baking recipes saved with `isBakerMode: true` still render `BakerCalculator`.
   - **Discovered Flaw**: No interactive user switch exists in `ViewRecipeModal.tsx` for viewers to toggle between Baker Calculator mode and standard ingredient list mode.

### R2 Observations
1. **File `src/routes/chef.tsx` (lines 731-760)**:
   - Verbatim code:
     ```tsx
     {showMic ? (
       <button
         type="button"
         onPointerDown={(e) => e.preventDefault()}
         onClick={() => {
           if (!voice.hasQuota && !voice.quotaLoading && voice.quota) {
             setVoiceLimit({ open: true, isPremium: voice.quota.isPremium });
             return;
           }
           void voice.start();
         }}
         ...
       >
         <Mic className="h-4 w-4" />
       </button>
     ) : ...}
     ```
   - `showMic` is `input.trim().length === 0 && !image && !attachedRecipe`. Mic is hidden during typing or when attachments exist.
   - Free users currently run `voice.start()` and are granted 60s quota before `VoiceLimitModal` pops up, which states "Alcanzaste tu minuto diario".
2. **File `src/components/ChefFab.tsx` (lines 9-20)**:
   - Currently contains a single `<Link to="/chef">` button with `<Sparkles />`. No dedicated voice call button is rendered in `ChefFab`.
3. **File `src/components/chef/VoiceLimitModal.tsx` (lines 15-53)**:
   - Mentions "Alcanzaste tu minuto diario. Con el plan gratuito tienes 1 minuto de voz al día para probar a Kiko."
   - Requirement R2 specifies that talking to Kiko via hands-free voice is a **Melik+ feature**. Free users clicking the voice call button should NOT start a 60-second trial call; they must be shown a subtle, visually consistent upsell modal redirecting to `/melik-plus`. Active Melik+ users can use ElevenLabs voice interaction as intended.

---

## 2. Logic Chain

1. **R1 Keyword Enforceability**:
   - Observation: `ViewRecipeModal.tsx` checks `recipe.isBakerMode === true` without verifying `isBakingCategory(recipe.category)`.
   - Deduction: Non-baking recipes can accidentally render `BakerCalculator` if `isBakerMode` was set.
   - Fix: Modify `bakerMode` calculation in `ViewRecipeModal.tsx` to require `isBakingCategory(recipe.category) === true` as a prerequisite for any baker mode rendering.
   - Observation: `RecipeFormModal.tsx` renders switch conditionally on `categoryIsBaking`. Adding an interactive toggle switch in `ViewRecipeModal.tsx` under `isBakingCategory` allows viewers to toggle baker percentage view and total weight calculator synchronously.

2. **R2 Voice Paywall & Button Visibility**:
   - Observation: `ChefFab.tsx` lacks a voice call button; `chef.tsx` mic button is hidden when text is present, and free users start a 60s voice session instead of seeing a Melik+ paywall modal.
   - Deduction: To satisfy R2:
     a) `ChefFab.tsx` must be updated to include a visible Kiko hands-free voice call button alongside the chat button.
     b) In `chef.tsx`, header/input voice buttons must be visible to all users.
     c) When clicked by a free user (`!isPremium`), show a branded Melik+ Voice Upsell Modal (`KikoVoicePaywallModal`) with text explaining hands-free voice call is a Melik+ feature and CTA linking directly to `/melik-plus`.
     d) When clicked by an active Melik+ user (`isPremium`), proceed with ElevenLabs WebRTC session (`voice.start()`).

---

## 3. Caveats

- **No Source Code Edits Made**: This survey is strictly read-only per constraints. Implementation will be performed by the designated implementer agent.
- **Server Function Permissions**: Server-side functions in `voice.functions.ts` / `voice.server.ts` should also enforce `isPremium` checks as a security fallback when issuing ElevenLabs WebRTC conversation tokens.

---

## 4. Conclusion

- **R1 Assessment**: The baker calculator math in `baker-calc.ts` is fully intact and pure. The primary bugs are in `ViewRecipeModal.tsx` (ignoring category keyword check when `isBakerMode: true` and missing an interactive synchronized toggle).
- **R2 Assessment**: Free user voice call behavior in `chef.tsx` and `use-kiko-voice.ts` currently provides a 1-minute daily trial, which violates R2 requirement. Refactoring `ChefFab.tsx`, `chef.tsx`, and `VoiceLimitModal.tsx` to enforce immediate Melik+ upsell modal display with `/melik-plus` redirect for free users while enabling active Melik+ users to call ElevenLabs fulfills R2 completely.

---

## 5. Verification Method

1. **R1 Verification**:
   - Open `RecipeFormModal.tsx` with category "Pan Focaccia" -> observe "¿Usar Porcentaje Panadero?" switch appears.
   - Change category to "Ensalada" -> observe switch disappears and `bakerMode` resets to false.
   - Open a recipe in `ViewRecipeModal.tsx` with category "Pan Focaccia" -> observe Baker Percentage & Calculator view toggle.
   - Open a recipe in `ViewRecipeModal.tsx` with category "Sopa" -> observe Baker Calculator view never appears regardless of `isBakerMode` flag.

2. **R2 Verification**:
   - Log in as a free (non-Melik+) user -> observe Kiko voice call button on `ChefFab` and `/chef`.
   - Click the Kiko voice call button -> observe subtle, visually consistent Melik+ voice upsell modal opens informing user that voice call is a Melik+ feature, with CTA navigating directly to `/melik-plus`.
   - Log in as an active Melik+ user -> click Kiko voice call button -> observe ElevenLabs WebRTC voice call initializes as intended.
   - Run `npm run build` to verify 0 TypeScript or bundling errors.

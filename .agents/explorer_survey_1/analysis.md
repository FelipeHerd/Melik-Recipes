# Comprehensive Codebase Analysis: R1 & R2

**Target Scope**:
- **R1**: Baker Calculator & Recipe Form Logic (`RecipeFormModal.tsx`, `ViewRecipeModal.tsx`, `baker-calc.ts`, category baking/bread keywords, synchronized toggling).
- **R2**: Melik+ Paywall & Kiko Voice Call UX (`chef.tsx`, `ChefFab.tsx`, ElevenLabs voice call button visibility, upsell modal redirecting free users to `/melik-plus`, active Melik+ user voice interactions).

---

## Part 1: R1 — Baker Calculator & Recipe Form Logic

### 1.1 Overview & Key Requirements
1. **Keyword Filtering**: The baker's percentage calculator option and switch in `RecipeFormModal.tsx` and `ViewRecipeModal.tsx` MUST ONLY appear when the recipe category matches bread/baking keywords (e.g. pan, focaccia, pizza, sourdough, baguette, brioche, croissant, etc.).
2. **Synchronized Toggling**: When enabled by the user, both baker percentage mode (ingredient input/display in `%`) and the calculator (peso total input & recalculation) toggle together as a unified mode.
3. **Math Preservation**: Existing pure baker calculator math in `src/lib/baker-calc.ts` must be preserved intact.

### 1.2 Current Implementation Analysis

#### A. `src/lib/baker-calc.ts`
- **Location**: `src/lib/baker-calc.ts`
- **Normalized Category Checking**:
  ```typescript
  const BAKING_KEYWORDS = ["pan", "panaderia", "masa", "sourdough", "focaccia", "baguette", "pizza", "brioche", "croissant"];

  function normalizeCategory(cat: string | null | undefined): string {
    return (cat ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  }

  export function isBakingCategory(cat: string | null | undefined): boolean {
    const n = normalizeCategory(cat);
    if (!n) return false;
    return BAKING_KEYWORDS.some((k) => n.includes(normalizeCategory(k)));
  }
  ```
- **Math Helpers**:
  - `unitToGramFactor(unit)`: Converts `g`, `gr`, `kg`, `ml`, `l`, `litro` to gram multiplier.
  - `parseQuantity(raw)`: Parses integers, decimals, and simple fractions (`1/2`).
  - `formatScaledQty(val)`: Rounds to max 2 decimals, removing trailing zeroes.
  - `parsePercent(raw)`: Parses `"70"`, `"70%"`, `"1.5"` to positive number.
  - `gramsFromPercent(pct, totalWeight, pTotal)`: `totalWeight * (pct / pTotal)`.
  - `totalFromIngredientGrams(grams, pct, pTotal)`: `grams * (pTotal / pct)`.
- **Finding**: Math functions in `baker-calc.ts` are pure and solid. Keyword list can be expanded to include English variants `"bread"`, `"bakery"`, `"baking"`, and Spanish `"bolleria"`, `"reposteria"`.

#### B. `src/components/RecipeFormModal.tsx`
- **Location**: `src/components/RecipeFormModal.tsx`
- **Current Category Check & Switch Logic (lines 82, 109–112, 461–469)**:
  ```typescript
  const categoryIsBaking = isBakingCategory(category);
  const [bakerMode, setBakerMode] = useState<boolean>(initial?.isBakerMode ?? false);
  
  useEffect(() => {
    if (!categoryIsBaking && bakerMode) setBakerMode(false);
  }, [categoryIsBaking, bakerMode]);
  const bakerFormMode = categoryIsBaking && bakerMode;
  ```
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
- **Finding / Issues in `RecipeFormModal.tsx`**:
  - The switch is correctly hidden when `!categoryIsBaking`.
  - However, when `bakerMode` is toggled ON, ingredients are edited with `%` as unit (`onChange={(e) => onChange({ quantity: e.target.value, unit: "%" })}`).
  - When submitting or autosaving, `isBakerMode: bakerFormMode` is persisted.

#### C. `src/components/ViewRecipeModal.tsx`
- **Location**: `src/components/ViewRecipeModal.tsx`
- **Current Logic (lines 96–99, 218–223)**:
  ```typescript
  const hasPercent = recipe.ingredients.some((i) => (i.unit ?? "").trim() === "%");
  const bakerMode =
    recipe.isBakerMode === true ||
    (recipe.isBakerMode === undefined && isBakingCategory(recipe.category) && hasPercent);
  ```
- **CRITICAL BUGS Identified in `ViewRecipeModal.tsx`**:
  1. **Bypassing Category Keyword Check**: If `recipe.isBakerMode` was set to `true` (e.g. manually or from prior draft), `bakerMode` evaluates to `true` EVEN IF `recipe.category` is changed to a non-baking category like `"Ensaladas"` or `"Postres"`! The `recipe.isBakerMode === true` check does NOT enforce `isBakingCategory(recipe.category)`.
  2. **Lack of User Toggle Control**: In `ViewRecipeModal.tsx`, there is no explicit interactive switch for viewers to toggle Baker Calculator mode on or off. `bakerMode` is statically computed. If a user views a bread recipe, they cannot toggle between standard ingredients view and Baker Calculator view.
  3. **Un-synchronized Display**: If `bakerMode` is false, it renders a standard checklist. If true, it renders `<BakerCalculator recipe={recipe} />`. The requirement states: *"When enabled by the user, both baker percentage mode and the calculator toggle together."* In `ViewRecipeModal.tsx`, there should be an interactive switch (visible ONLY when `isBakingCategory(recipe.category)` is true) that toggles Baker Percentage & Calculator mode synchronously.

### 1.3 Proposed Code Changes for R1

1. **`src/lib/baker-calc.ts`**:
   - Expand `BAKING_KEYWORDS` to include `"bread"`, `"bakery"`, `"baking"`, `"bolleria"`, `"reposteria"`:
     ```typescript
     const BAKING_KEYWORDS = [
       "pan", "panaderia", "panaderia", "masa", "sourdough", "focaccia", 
       "baguette", "pizza", "brioche", "croissant", "bread", "bakery", 
       "baking", "bolleria", "reposteria"
     ];
     ```

2. **`src/components/ViewRecipeModal.tsx`**:
   - Enforce strict category requirement:
     ```typescript
     const categoryIsBaking = isBakingCategory(recipe.category);
     const hasPercent = recipe.ingredients.some((i) => (i.unit ?? "").trim() === "%");
     const defaultBakerMode = categoryIsBaking && (recipe.isBakerMode === true || (recipe.isBakerMode === undefined && hasPercent));
     const [userBakerMode, setUserBakerMode] = useState<boolean>(defaultBakerMode);
     
     // Reset if category is not baking
     const activeBakerMode = categoryIsBaking && userBakerMode;
     ```
   - Render a synchronized toggle switch inside `ViewRecipeModal.tsx` when `categoryIsBaking` is true, allowing the user to toggle Baker Calculator mode (which displays percentage formula + weight calculator together).

3. **`src/components/RecipeFormModal.tsx`**:
   - Keep switch strict on `categoryIsBaking`. Ensure toggling `bakerMode` updates units and formula display synchronously.

---

## Part 2: R2 — Melik+ Paywall & Kiko Voice Call UX

### 2.1 Overview & Key Requirements
1. **Voice Call Button Visibility**: The Kiko hands-free voice call button must be visible to ALL users across the UI (`chef.tsx`, `ChefFab.tsx`, etc.).
2. **Free User Paywall UX**: When a free (non-Melik+) user clicks the Kiko voice call button:
   - Present a subtle, visually consistent modal or prompt in the app's exact design system (`AlertDialog` or `Dialog` with `--ochre` / `Crown` branding).
   - Inform them that hands-free voice interaction with Kiko is a Melik+ feature.
   - Provide a CTA button that navigates directly to `/melik-plus`.
3. **Active Melik+ User UX**: Active Melik+ users (`isPremium === true`) can initiate and use ElevenLabs voice interaction as intended.

### 2.2 Current Implementation Analysis

#### A. `src/routes/chef.tsx`
- **Current Mic Button Logic (lines 731–762)**:
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
      disabled={thinking || voice.status !== "idle"}
      className="..."
      aria-label="Hablar con Kiko"
    >
      <Mic className="h-4 w-4" />
    </button>
  ) : ...}
  ```
- **CRITICAL BUGS / GAPS in `chef.tsx`**:
  1. **Free User Quota Ambiguity**: The current system attempts to grant free users 60 seconds (`VOICE_LIMIT_FREE_SECONDS = 60`) of voice call before showing `VoiceLimitModal`. This contradicts requirement R2! Free users should NOT start a 60-second ElevenLabs WebRTC call; clicking the voice call button MUST immediately trigger the Melik+ upsell modal informing them that voice with Kiko is a Melik+ feature, with a CTA to `/melik-plus`.
  2. **Visibility Constraint**: The mic button (`showMic`) is currently hidden whenever the user types text (`input.trim().length > 0`) or attaches an image/recipe. Furthermore, there is no top-level header voice call action button in `/chef` for instant hands-free activation.

#### B. `src/components/ChefFab.tsx`
- **Location**: `src/components/ChefFab.tsx`
- **Current Implementation**:
  ```tsx
  export function ChefFab({ recipeId }: { recipeId?: string }) {
    return (
      <Link
        to="/chef"
        search={recipeId ? ({ recipeId } as never) : undefined}
        aria-label="Abrir asistente Kiko"
        className="fixed bottom-24 right-5 z-30 inline-flex items-center justify-center rounded-full bg-primary w-12 h-12 text-primary-foreground shadow-xl ..."
      >
        <Sparkles className="h-5 w-5" />
      </Link>
    );
  }
  ```
- **CRITICAL GAPS in `ChefFab.tsx`**:
  - `ChefFab` currently only renders a single text-chat button (`/chef`).
  - It does NOT provide a Kiko hands-free voice call button.
  - Requirement R2 explicitly requests: *"Make the Kiko hands-free voice call button visible to all users across the UI (`chef.tsx`, `ChefFab.tsx`, etc.)."*

#### C. `src/components/chef/VoiceLimitModal.tsx` & Paywall Modals
- **Location**: `src/components/chef/VoiceLimitModal.tsx`
- **Current Behavior**:
  ```tsx
  <AlertDialogTitle className="text-center">
    {isPremium ? "Alcanzaste tus 15 minutos de hoy" : "Alcanzaste tu minuto diario"}
  </AlertDialogTitle>
  <AlertDialogDescription className="text-center">
    {isPremium
      ? "Tu tiempo de voz con Kiko se renueva mañana a medianoche..."
      : "Con el plan gratuito tienes 1 minuto de voz al día para probar a Kiko. Con Melik+ hablas hasta 15 minutos diarios."}
  </AlertDialogDescription>
  ```
- **Finding**: This modal phrasing ("1 minuto de voz al día") is obsolete under R2 rules. It must be refactored into a clear, elegant Melik+ Voice Paywall Modal (`KikoVoicePaywallModal`) or updated so that free users clicking voice call are shown:
  - Title: *"Hablar con Kiko por voz es una función Melik+"*
  - Description: *"Cocina con las manos libres conversando en tiempo real con Kiko. Suscríbete a Melik+ para activar la voz interactiva con ElevenLabs."*
  - Primary CTA: Button navigating directly to `/melik-plus` with `<Crown />` icon.

#### D. Server Functions & Auth Checks (`voice.functions.ts` & `voice.server.ts`)
- **Location**: `src/lib/voice.functions.ts`, `src/lib/voice.server.ts`
- **Finding**: On the server, `getElevenLabsToken` currently checks `if (quota.remainingSeconds <= 0) throw Error(...)`. For active Melik+ users, `isPremium` is checked via `resolveLimit(userId)` (`hasActivePremium` / `isAdminOrDev`). If a free user attempts to call `getElevenLabsToken`, the server should reject or enforce premium requirement, ensuring system integrity.

### 2.3 Proposed Code Changes for R2

1. **`src/components/ChefFab.tsx`**:
   - Enhance `ChefFab` to present both the Kiko chat trigger and a dedicated Kiko Hands-Free Voice Call button (`<Mic />`).
   - Clicking the Kiko voice call button on `ChefFab`:
     - If user is free (`!isPremium`), opens the subtle Melik+ voice upsell modal (with CTA to `/melik-plus`).
     - If user is Melik+ (`isPremium`), navigates to `/chef?voice=true` to immediately initiate ElevenLabs voice call.

2. **`src/components/chef/KikoVoicePaywallModal.tsx` (or updated `VoiceLimitModal.tsx`)**:
   - Implement/refactor a visually consistent modal using shadcn `AlertDialog` / `Dialog` matching app design system (`bg-card`, `border-[color:var(--ochre)]/40`, `Crown` badge).
   - Inform free users that hands-free voice with Kiko is a Melik+ benefit.
   - CTA button: `Link to="/melik-plus"` ("Suscribirme a Melik+" / "Ver Melik+").

3. **`src/routes/chef.tsx`**:
   - Ensure the voice call button (`<Mic />`) is prominently visible in the header and input bar for all users.
   - On click:
     ```typescript
     if (!isPremium) {
       setShowVoicePaywall(true); // Opens Melik+ voice upsell modal
       return;
     }
     void voice.start(); // Active Melik+ user starts ElevenLabs call
     ```
   - Support `?voice=true` search param so navigating from `ChefFab` automatically triggers voice call for Melik+ users or opens upsell modal for free users.

---

## Summary of Findings & Next Steps

| Requirement | Key Issues Found | Proposed Action |
| flex | | |
| **R1 (Baker Calc)** | `ViewRecipeModal.tsx` ignores `isBakingCategory` if `isBakerMode` is true; no interactive toggle in `ViewRecipeModal.tsx`. | Enforce `isBakingCategory` strictly in `ViewRecipeModal.tsx` & add synchronized toggle. Expand baking keywords in `baker-calc.ts`. |
| **R2 (Melik+ Voice)** | Free users get 60s quota instead of paywall modal; voice button missing from `ChefFab.tsx` & conditional in `chef.tsx`. | Add Voice button to `ChefFab.tsx` and header of `chef.tsx`. Show Melik+ voice upsell modal for free users with CTA to `/melik-plus`. Allow active Melik+ users to use ElevenLabs voice. |

Everything is documented in detail for downstream implementation.

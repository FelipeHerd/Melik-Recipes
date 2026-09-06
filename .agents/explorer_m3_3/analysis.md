# Milestone M3: Guest Recipe Import Flow Preservation Analysis Report

## Executive Summary
This audit evaluated the guest recipe creation, `localStorage` persistence, post-authentication migration detection, and modal dialog flow (`GuestMigrationModal.tsx`) across the Melik Recipes v2 codebase.

Overall, the guest migration subsystem is well-structured, robust, and correctly integrated into the application root (`__root.tsx`). Unauthenticated users can create recipes in `localStorage` under `meliks.recipes.guest.v1`, and upon logging in or registering, `GuestMigrationModal` reliably mounts and prompts the user to import their local guest recipes into their cloud account.

Two minor edge cases were identified during the audit (detailed below), with proposed non-breaking fixes.

---

## 1. Codebase Reference Audit

All references to `GuestMigrationModal` and guest migration logic were audited across the project:

| File Path | Location / Reference | Description | Status |
|---|---|---|---|
| `src/components/GuestMigrationModal.tsx` | Line 8 (`export function GuestMigrationModal`) | Main modal component definition | ✅ Defined |
| `src/routes/__root.tsx` | Line 22 (`import { GuestMigrationModal }...`) | Component import in root route layout | ✅ Imported |
| `src/routes/__root.tsx` | Line 359 (`<GuestMigrationModal />`) | Mounted directly inside `RootComponent()` under `<RecipesProvider>` | ✅ Mounted |
| `src/lib/recipes-context.tsx` | Lines 136–138, 148, 157–172, 319–370 | Context state & actions (`pendingGuestMigration`, `confirmMigration`, `discardMigration`) | ✅ Implemented |
| `src/lib/recipes.functions.ts` | Lines 361–372 (`migrateGuestRecipes`) | Server function handling batch insert of migrated recipes | ✅ Implemented |

---

## 2. Mounting & Life-Cycle Verification

### Mounting Location in Component Tree
`GuestMigrationModal` is mounted in `src/routes/__root.tsx` inside `RootComponent()`:
```tsx
function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <RecipesProvider>
        <AppShell />
        <TrialBanner />
        <GuestMigrationModal />
        <Toaster richColors position="top-center" />
      </RecipesProvider>
    </QueryClientProvider>
  );
}
```

### Post-Auth Navigation & Trigger Reliability
1. **Unauthenticated Creation**: Guest recipes are stored locally via `saveGuest()` into `window.localStorage["meliks.recipes.guest.v1"]`.
2. **Auth Event Listening**: In `recipes-context.tsx`, `supabase.auth.onAuthStateChange` listens for the `SIGNED_IN` event. When triggered with a valid `userId`, it calls `loadGuest()`.
3. **Pending State Initialization**: If `loadGuest()` returns 1 or more recipes, `setPendingGuestMigration(pending)` populates `pendingGuestMigration`.
4. **Initial Load Support**: If a user reloads the app or opens a new tab while already logged in and leftover guest recipes exist in `localStorage`, `supabase.auth.getUser()` in `useEffect` also sets `pendingGuestMigration`.
5. **Modal Render Condition**: `GuestMigrationModal` evaluates `hasPendingMigration = !!pendingGuestMigration && pendingGuestMigration.length > 0`. If `true`, the modal dialog renders instantly over any current route page (including `/` after redirection from `/auth`).

---

## 3. TypeScript Type Safety & Server Contract Audit

### Type Consistency
- `pendingGuestMigration`: Typed as `Recipe[]` in `Ctx` interface.
- `confirmMigration`: Typed as `() => Promise<number>` in `Ctx` interface.
- `discardMigration`: Typed as `() => void` in `Ctx` interface.
- `migrateGuestRecipes`: Server function accepting `{ recipes: RecipeInput[] }` validated by Zod schema `recipeInputSchema`.

### Field Mapping Verification
`confirmMigration` converts guest recipes (`Recipe`) to `RecipeInput` for `migrateGuestRecipes`:
```tsx
{
  title: r.title,
  ingredients: r.ingredients,
  instructions: r.instructions.map((s) => ({ text: s.text, imagePath: s.imagePath ?? null })),
  category: r.category,
  timeMinutes: r.timeMinutes,
  emoji: r.emoji,
  notes: "",
  imagePath,
  isBakerMode: r.isBakerMode,
}
```
All fields (`title`, `ingredients`, `instructions`, `category`, `timeMinutes`, `emoji`, `notes`, `imagePath`, `isBakerMode`) strictly match the Zod validation rules defined in `recipeInputSchema` in `recipes.functions.ts`.

---

## 4. Design System & Accessibility Audit

`GuestMigrationModal.tsx` complies with the project's visual and UX design system:
- **Typography**: Uses `font-display` (Playfair Display) for header text (`Importar tus recetas`).
- **Color Palette & Accents**: Uses `bg-primary`, `text-primary`, `bg-primary/10`, `text-muted-foreground`, matching app aesthetics.
- **Layout Responsiveness**: Implements a bottom sheet drawer on mobile (`items-end p-0 rounded-t-3xl`) and centered dialog modal on desktop (`sm:items-center sm:p-6 sm:rounded-3xl`).
- **Accessibility Attributes**:
  - `role="dialog"`
  - `aria-modal="true"`
  - `aria-labelledby="guest-migration-title"`
  - `aria-label="Descartar recetas de invitado"` on close icon button.

---

## 5. Identified Findings & Proposed Fixes

### Finding 1: `imagePath` Fallback in `confirmMigration` (Minor Edge Case)
- **Observation**: In `recipes-context.tsx` lines 326–340, when `confirmMigration` converts data-URL images (`url.startsWith("data:")`), if the image is NOT a data-URL (e.g. if `r.imagePath` was already set or `url` is `null`), `imagePath` is assigned `null`.
- **Impact**: If a guest recipe somehow already had a valid `imagePath`, it would be wiped to `null` during migration.
- **Proposed Fix**:
  ```tsx
  // Fallback to r.imagePath if data-URL upload wasn't executed or failed
  imagePath: imagePath ?? r.imagePath ?? null
  ```

### Finding 2: Callback Stability for `useModalA11y` in `GuestMigrationModal` (Performance)
- **Observation**: `GuestMigrationModal.tsx` calls `useModalA11y(() => {}, hasPendingMigration)` with an inline arrow function. Because `useModalA11y` lists `onClose` in its `useEffect` dependency array, an unmemoized inline function causes `useModalA11y`'s effect to re-run on every render tick.
- **Impact**: Minor unnecessary effect re-subscription / listener re-binding during renders.
- **Proposed Fix**: Pass a stable no-op callback reference (`const NOOP = () => {};` outside component body) to `useModalA11y`.

---

## 6. Verification Method

To verify the guest recipe import flow manually or via automated test:
1. Open the application as an unauthenticated guest.
2. Create 1 or 2 guest recipes (e.g., "Pan de Masa Madre" and "Focaccia de Romero").
3. Verify that `window.localStorage.getItem("meliks.recipes.guest.v1")` contains the guest recipes.
4. Navigate to `/auth` and log in or create a new user account.
5. Confirm that upon completing authentication and landing on `/`, `GuestMigrationModal` automatically appears with "Importar tus recetas".
6. Click "Sí, importar (2)" and verify that:
   - A success toast `Se importaron 2 recetas a tu cuenta` appears.
   - The modal closes.
   - The guest recipes now appear in the cloud recipes list.
   - `window.localStorage.getItem("meliks.recipes.guest.v1")` is cleared (`null`).

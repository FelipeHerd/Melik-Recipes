# Milestone M3: Guest Recipe Import Flow Preservation Analysis Report

## Executive Summary
This report analyzes the lifecycle, state transitions, storage mechanisms, error handling, and edge cases of the Guest Recipe Import Flow in **Melik Recipes v2**.

The investigation confirms that the guest recipe creation, local storage persistence, post-login detection, modal presentation (`GuestMigrationModal.tsx`), cloud migration (`migrateGuestRecipes`), image upload handling, and cache invalidation are already implemented and architecturally sound. Minor enhancements are recommended for edge-case resilience (corrupted JSON auto-cleanup, batch size safety, and explicit parameter defaults).

---

## 1. Complete Guest Recipe Lifecycle Trace

```
+-----------------------------------------------------------------------------------+
| 1. GUEST CREATION                                                                |
| RecipeFormModal -> RecipesContext.addRecipe(payload)                              |
| - Checks userId === null                                                          |
| - Validates image file size <= 1 MB (MAX_GUEST_IMAGE_BYTES)                      |
| - Converts cover image to base64 Data URL (FileReader)                           |
| - Generates UUID & timestamp                                                      |
| - Appends to guest state array                                                   |
+-----------------------------------------------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
| 2. LOCALSTORAGE PERSISTENCE                                                       |
| saveGuest(guest) -> window.localStorage.setItem("meliks.recipes.guest.v1", JSON)  |
| - Removes legacy key "meliks.recipes.v1"                                          |
| - On app load: loadGuest() reads & parses JSON with normalizeGuestRecipe()        |
+-----------------------------------------------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
| 3. AUTHENTICATION EVENT (Login / Signup)                                          |
| supabase.auth.onAuthStateChange("SIGNED_IN") / getUser()                          |
| - Detects authenticated userId                                                    |
| - Calls loadGuest() -> if recipes exist, sets pendingGuestMigration(pending)      |
+-----------------------------------------------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
| 4. MODAL TRIGGER & UI PRESENTATION                                                |
| GuestMigrationModal mounted in __root.tsx                                         |
| - Checks pendingGuestMigration.length > 0                                         |
| - Displays backdrop modal with recipe count & action buttons                      |
| - A11y focus trap active (does not dismiss on Escape to enforce explicit choice)  |
+-----------------------------------------------------------------------------------+
                     |                                       |
          (User clicks "Sí, importar")             (User clicks "No, descartar")
                     v                                       v
+----------------------------------------+ +----------------------------------------+
| 5. CLOUD MIGRATION                     | | DISCARD FLOW                           |
| RecipesContext.confirmMigration()       | | RecipesContext.discardMigration()     |
| a. Uploads base64 images -> Supabase   | | - clearGuestStorage()                  |
| b. Calls migrateGuestRecipes({recipes})| | - setGuest([])                         |
| c. Server attaches user_id & inserts   | | - setPendingGuestMigration([])         |
| d. clearGuestStorage() & setGuest([])  | | - Toast: "Recetas descartadas"         |
| e. Refetches recipes via React Query   | +----------------------------------------+
| f. Toast: "Se importaron X recetas"    |
+----------------------------------------+
```

### Detailed Component & Code Inspection

1. **Creation & Storage (`src/lib/recipes-context.tsx`)**:
   - Storage Key: `meliks.recipes.guest.v1` (`GUEST_KEY`).
   - Legacy Key: `meliks.recipes.v1` (`LEGACY_KEY`).
   - Guest Cover Image Limit: `MAX_GUEST_IMAGE_BYTES` = 1,000,000 bytes (~1 MB).
   - Helper `normalizeGuestRecipe(raw)` validates required fields (`id`, `title`), parses ingredients and instructions using `parseIngredients` and `parseSteps`, and defaults safe fallbacks for missing values (`category`, `timeMinutes`, `createdAt`, `emoji`).

2. **Auth Detection (`src/lib/recipes-context.tsx`)**:
   - `useEffect` initializes auth status via `supabase.auth.getUser()`.
   - Listens to `onAuthStateChange`.
   - On `"SIGNED_IN"` event or authenticated startup: if `loadGuest()` yields items, `setPendingGuestMigration(pending)` populates state.

3. **Modal Component (`src/components/GuestMigrationModal.tsx`)**:
   - Mounted in root shell (`src/routes/__root.tsx`).
   - Displays modal when `pendingGuestMigration.length > 0`.
   - Prevents accidental dismissal on Escape via `useModalA11y`.
   - Offers "Sí, importar" (`confirmMigration`) and "No, descartar" (`discardMigration`).

4. **Server Migration Function (`src/lib/recipes.functions.ts`)**:
   - `migrateGuestRecipes`: Endpoint protected by `requireSupabaseAuth` middleware.
   - Validates input with Zod schema (`z.object({ recipes: z.array(recipeInputSchema).max(500) })`).
   - Explicitly assigns `user_id: context.userId` to all inserted DB rows.
   - Performs a single batch insert into Supabase `recipes` table.

---

## 2. Comprehensive Edge Case Analysis

| Edge Case | Observed System Behavior | Risk Level | Assessment & Findings |
|-----------|--------------------------|------------|-----------------------|
| **1. Invalid / Corrupted JSON in localStorage** | `loadGuest()` wraps `JSON.parse` in `try...catch`, returning `[]` on error. Invalid item shapes return `null` in `normalizeGuestRecipe` and get filtered out. | Low | Safe & non-crashing. Bad JSON is ignored. (Enhancement: clear corrupted key in catch block). |
| **2. Modal Closure / Page Reload during Prompt** | `localStorage` remains intact. Upon page reload or next login session, `loadGuest()` detects the recipes and re-triggers the migration modal. Modal ignores Escape key. | Low | Excellent data preservation. No recipes are lost if user closes browser. |
| **3. Network Error / Server Failure during Migration** | `confirmMigration()` throws before executing `clearGuestStorage()`. `localStorage` remains intact. Modal stays open with error toast, allowing user to retry. | Low | Safe & non-destructive. Retry mechanism works out of the box. |
| **4. User Ownership Linking (`user_id`)** | Server function `migrateGuestRecipes` injects `user_id: context.userId` from authenticated session token into all DB rows. | None | Correctly linked to the new user's Supabase account. |
| **5. Base64 Cover Images Upload** | `confirmMigration()` converts `data:` URLs to `Blob`/`File` and uploads to Supabase storage. Upload errors for individual images fallback to `imagePath = null` without failing recipe migration. | Low | Highly resilient. Image upload issues do not block recipe text migration. |
| **6. Baker Mode Preservation** | `isBakerMode` flag is parsed and preserved in `normalizeGuestRecipe`, sent during `migrateGuestRecipes`, and saved in DB `is_baker_mode` column. | None | Math and percentage settings remain intact post-migration. |
| **7. Multi-Tab Auth Sync** | When Tab 1 completes migration, `clearGuestStorage()` removes key from `localStorage`. Tab 2 receiving `SIGNED_IN` reads empty `localStorage` and does not duplicate prompt. | None | Clean sync across browser tabs. |
| **8. Max Batch Size Limit** | Server Zod schema enforces `recipes.length <= 500`. Guest localStorage quota prevents exceeding this limit. | Very Low | Recommendation to slice array to max 500 in `confirmMigration` for added safety. |

---

## 3. Actionable Recommendations for Worker M3

1. **Storage Cleanup on Corrupted JSON**:
   In `src/lib/recipes-context.tsx` inside `loadGuest()`, add `clearGuestStorage()` within the `catch` block. This ensures that if `localStorage` contains unparseable syntax, the corrupt key is cleaned up rather than lingering.

2. **Array Slice Safety Guard**:
   In `src/lib/recipes-context.tsx` inside `confirmMigration()`, ensure `pendingGuestMigration.slice(0, 500)` is passed to `migrateGuestRecipes` to strictly guarantee compliance with the server Zod `max(500)` validator.

3. **Explicit Visibility Flag Parameter**:
   In `src/lib/recipes-context.tsx` inside `confirmMigration()`, explicitly map `isPublic: r.isPublic ?? false` (or `true` per business rules) so the field is unambiguous when sent to `migrateGuestRecipes`.

4. **Verification Test Suite Execution**:
   Run `npm run build` to confirm 0 TypeScript or bundling errors.

---

## 4. Verification Method

- **Build Check**: `npm run build`
- **File Inspection**:
  - `src/components/GuestMigrationModal.tsx`
  - `src/lib/recipes-context.tsx` (lines 58-115, 319-370)
  - `src/lib/recipes.functions.ts` (lines 361-372)
- **Runtime Flow Verification**:
  1. Save a recipe while logged out (creates entry in `localStorage.getItem("meliks.recipes.guest.v1")`).
  2. Log in / Sign up.
  3. Verify `GuestMigrationModal` pops up automatically.
  4. Confirm migration and check that recipes appear in user list and `localStorage` is cleared.

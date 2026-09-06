# Full Codebase Survey & Audit Analysis (R5 & R6)

**Target Directory**: `c:/Users/User/Desktop/El Peque/Melik/Melik Recipes/v2/v2_Melik Recipes`  
**Explorer**: Explorer Survey 3  
**Date**: 2026-08-13  

---

## Executive Summary

This report delivers a thorough, read-only investigation and static audit of the **Melik Recipes v2** codebase, focusing on:
1. **Requirement R5**: Official Recipe Broadcast Notifications (`official-recipes.functions.ts`, `admin-notifications.functions.ts`, `recipes.functions.ts`).
2. **Requirement R6**: Full Codebase Audit & Build Check (TypeScript types, state logic, UI/UX consistency, error handling across routes, components, hooks, and server functions).

---

## 1. R5: Official Recipe Broadcast Notifications Audit

### 1.1 Current Architecture & Observations
- **`src/lib/official-recipes.functions.ts`**:
  - `listOfficialRecipes`: POST handler returning paginated official recipe cards for public/guest users.
  - `getOfficialRecipe`: POST handler returning full official recipe details with server-side redaction (`isLocked`) for non-Melik+ users.
  - **Finding**: Contains no functions for recipe creation, publishing, or notification broadcasting.
- **`src/lib/recipes.functions.ts`**:
  - `adminCreateOfficialRecipe` (lines 653–677): Server function executed by admins to insert a recipe with `is_official_melik: true`.
  - `updateRecipe` (lines 295–336): Server function executed to update recipes (including official recipes).
  - **Finding**: Neither `adminCreateOfficialRecipe` nor `updateRecipe` contains any notification dispatch or user broadcast triggers when an official recipe is inserted or published (`is_draft: false`).
- **`src/lib/admin-notifications.functions.ts`**:
  - Contains `resolveSegment('all', 'admin')` (lines 142–213) which resolves all active user IDs, and `sendAdminNotification` (lines 501–708) for manual batch notifications via admin password step-up.
  - **Finding**: Lacks an automated broadcast function for official recipe creation/publication.
- **`src/lib/notification-templates.ts`**:
  - Contains templates for `welcome_plus_monthly`, `welcome_plus_yearly`, `plus_renewed`, `plus_ended`, `trial_expiring`, `trial_gift`, `kiko_blocked`, `kiko_unblocked`, `role_promoted`, `system_announcement`, etc.
  - **Finding**: Does not yet have a dedicated `official_recipe_published` template.

### 1.2 Identified Gap
When an admin creates a new official recipe or publishes an existing draft official recipe (`is_official_melik: true`, `is_draft: false`), zero notifications are created in the database. Active users receive no notice that a new official recipe is available in the Melik Bakery catalog.

### 1.3 Proposed Solution for R5
1. **Define Notification Template**:
   Add an `official_recipe_published` template in `src/lib/notification-templates.ts`:
   ```ts
   {
     id: "official_recipe_published",
     label: "Nueva receta oficial publicada",
     type: "system",
     title: "🎉 ¡Nueva receta oficial en Melik Bakery!",
     message: "Hemos publicado '{ctx.titulo}' en el Catálogo Oficial. ¡Descúbrela ya!",
     requiredContext: ["titulo", "recipe_id"],
     isAuto: true,
     description: "Se dispara automáticamente al publicar una receta oficial.",
   }
   ```
2. **Implement Broadcast Helper in `src/lib/official-recipes.functions.ts` or `src/lib/admin-notifications.functions.ts`**:
   ```ts
   export async function broadcastOfficialRecipeNotification(title: string, recipeId: string): Promise<number> {
     const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
     const { data: users } = await supabaseAdmin.from("profiles").select("id");
     if (!users || users.length === 0) return 0;
     
     const rows = users.map((u) => ({
       user_id: u.id,
       title: "🎉 ¡Nueva receta oficial disponible!",
       message: `Hemos publicado '${title}' en el catálogo oficial de Melik Bakery. ¡Ven a descubrirla!`,
       type: "system" as const,
       is_read: false,
     }));

     // Insert in chunks of 250
     let inserted = 0;
     for (let i = 0; i < rows.length; i += 250) {
       const chunk = rows.slice(i, i + 250);
       const { error } = await supabaseAdmin.from("notifications").insert(chunk);
       if (!error) inserted += chunk.length;
     }
     return inserted;
   }
   ```
3. **Trigger in Server Functions**:
   Call `broadcastOfficialRecipeNotification(data.title, row.id)` in `adminCreateOfficialRecipe` (when `!data.isDraft`), and in `updateRecipe` when `isOfficialMelik` is true and `is_draft` transitions to `false`.

---

## 2. R6: Full Codebase & Audit Findings

### 2.1 Baker Calculator & Category Filter Audit (R1)
- **`src/components/ViewRecipeModal.tsx` (Lines 97–99)**:
  - **Observation**:
    ```tsx
    const bakerMode =
      recipe.isBakerMode === true ||
      (recipe.isBakerMode === undefined && isBakingCategory(recipe.category) && hasPercent);
    ```
  - **Flaw**: If `recipe.isBakerMode === true` but `recipe.category` is changed to a non-baking category (e.g. "Ensaladas" or "Bebidas"), `bakerMode` remains `true` in `ViewRecipeModal`.
  - **Fix**: Require `isBakingCategory(recipe.category)` unconditionally:
    ```tsx
    const categoryIsBaking = isBakingCategory(recipe.category);
    const bakerMode = categoryIsBaking && (recipe.isBakerMode === true || (recipe.isBakerMode === undefined && hasPercent));
    ```

### 2.2 Melik+ Paywall & Kiko Voice Call UX Audit (R2)
- **`src/components/ChefFab.tsx` & `src/routes/chef.tsx` & `src/components/chef/VoiceLimitModal.tsx`**:
  - **Observation**: The voice interaction mic button in `chef.tsx` triggers `voice.start()`. Free users get 1 minute of daily voice time before `VoiceLimitModal` appears.
  - **Requirement R2**: The voice call button should be visible to all users. When a free user clicks it, it should present a subtle, visually consistent modal/prompt in Melik's design system informing them that talking to Kiko is a Melik+ feature, with a CTA navigating directly to `/melik-plus`.
  - **Fix**: Ensure that for non-Melik+ users (or when quota is exhausted), clicking the mic button triggers a clear, branded Melik+ upsell modal (`VoiceLimitModal` with custom title and direct CTA to `/melik-plus`).

### 2.3 Guest Recipe Migration Audit (R3)
- **`src/components/GuestMigrationModal.tsx` & `src/lib/recipes-context.tsx`**:
  - **Observation**: `loadGuest()` inspects `localStorage` for `meliks.recipes.guest.v1`. When a guest signs up or logs in, `RecipesProvider` detects `pendingGuestMigration` and displays `GuestMigrationModal`.
  - **Verification**: The migration logic converts data URLs to Cloud Storage files via `uploadRecipeImage` and inserts rows using `migrateGuestRecipes`. The flow is sound, fully functional, and needs preservation.

### 2.4 Payment Architecture & Error State Audit (R4)
- **`src/components/MelikPlusCheckoutModal.tsx` & `src/lib/melik-plus.functions.ts`**:
  - **Observation**: The current checkout modal directly invokes `simulateMelikPlusPayment` with hardcoded success/error buttons. It lacks a formal payment gateway abstraction layer.
  - **Flaw**: When payment fails or network issues occur, the error presentation is basic text ("Error de simulación: Tu tarjeta fue rechazada"). It does not feature a branded connection error component prepared for Stripe / MercadoPago integration.
  - **Fix**:
    1. Define clean TypeScript interfaces for payment providers:
       ```ts
       export interface PaymentProvider {
         id: 'stripe' | 'mercadopago' | 'mock';
         processPayment(request: PaymentRequest): Promise<PaymentResult>;
       }
       ```
    2. Add a branded payment connection error banner/modal component with error diagnostics ("No pudimos conectar con el proveedor de pagos. Por favor reintenta en unos momentos.") matching Melik's gold/ochre visual styling.

### 2.5 Codebase-Wide Type & Safety Checks (R6)
- **`src/lib/admin-notifications.functions.ts` (Line 173)**:
  - `sendAdminNotification` uses an `as any` type assertion when constructing payload for Zod schemas. This can be tightened by refining the discriminated union type in Zod schema.
- **Unhandled Errors & Toast Messages**:
  - Async server function calls (`useServerFn`) in `admin.catalogo.tsx`, `chef.tsx`, and `melik-plus.tsx` use `showError(err)`. Handlers are properly wrapped in `try/catch`.
- **UI/UX Alignment**:
  - Mobile bottom navigation (`MobileBottomNav` in `__root.tsx`) uses a sliding ochre pill with proper CSS transitions.
  - Keyboard avoidance in `chef.tsx` listens to `visualViewport` resize events to adapt layout.

---

## 3. Recommended Action Plan for Implementer

1. **R5 - Broadcast Notifications**:
   - Implement `broadcastOfficialRecipeNotification` in `admin-notifications.functions.ts` or `official-recipes.functions.ts`.
   - Call this function in `adminCreateOfficialRecipe` and `updateRecipe` when an official recipe is published.
2. **R1 - Baker Calculator Strict Category Lock**:
   - Enforce `isBakingCategory(recipe.category)` in `ViewRecipeModal.tsx`.
3. **R2 - Kiko Voice Upsell**:
   - Ensure clicking Kiko voice button for free users opens the Melik+ upsell modal with matching design system and CTA link to `/melik-plus`.
4. **R4 - Payment Architecture & Connection Error**:
   - Create payment gateway types (`PaymentGatewayService`) and implement a branded connection error state component in `MelikPlusCheckoutModal.tsx`.
5. **R6 - Build Verification**:
   - Execute type checks and ensure zero bundling / compilation errors.

# Original User Request

## 2026-08-13T10:10:56Z

Full scan, audit, bug fixing, payment architecture refactoring, and UI/UX optimization for Melik Recipes v2.

Working directory: c:/Users/User/Desktop/El Peque/Melik/Melik Recipes/v2/v2_Melik Recipes
Integrity mode: development

## Requirements

### R1. Baker Calculator & Recipe Form Logic
- Ensure the baker's percentage calculator option and switch in `RecipeFormModal.tsx` and `ViewRecipeModal.tsx` ONLY appear when the recipe category matches bread/baking keywords (e.g. pan, focaccia, pizza, etc.).
- When enabled by the user, both baker percentage mode and the calculator toggle together.
- Preserve existing baker calculator math in `baker-calc.ts`.

### R2. Melik+ Paywall & Kiko Voice Call UX
- Make the Kiko hands-free voice call button visible to all users across the UI (`chef.tsx`, `ChefFab.tsx`, etc.).
- When a free (non-Melik+) user clicks the Kiko voice call button, present a subtle, visually consistent modal or prompt in the app's exact design system informing them that talking to Kiko is a Melik+ feature, with a CTA button navigating directly to `/melik-plus`.
- Allow active Melik+ users to use ElevenLabs voice interaction as intended.

### R3. Guest Recipe Import Flow Preservation
- Verify and preserve the guest recipe localStorage creation and post-login/signup import popup modal (`GuestMigrationModal.tsx`). Ensure guest recipes are seamlessly migrated upon confirmation.

### R4. Payment Gateway Architecture Refactoring & Error State
- Refactor the current mock payment UI (`MelikPlusCheckoutModal.tsx`, `CreditCard3D.tsx`, `melik-plus.functions.ts`) into a robust, type-safe architecture prepared for payment gateway integration (e.g. Stripe / MercadoPago structure).
- Do not connect a live payment provider yet.
- Implement an elegant, branded connection error message that displays whenever a user attempts to complete a checkout transaction, indicating a connection issue with the payment provider, while maintaining the app's visual identity.

### R5. Official Recipe Broadcast Notifications
- In `official-recipes.functions.ts` or `admin-notifications.functions.ts`, ensure that whenever an official Melik recipe is created or published by an admin, a notification is broadcasted to all active user accounts in Supabase.

### R6. Full Codebase Bug, Workflow & UI/UX Audit & Fixes
- Perform a thorough audit of all frontend components, routes, hooks, database helpers, and server functions.
- Fix all TypeScript errors, broken state logic, UI alignment/accessibility flaws, and unhandled promise/error states across the codebase.
- Ensure `npm run build` completes with 0 errors.

## Acceptance Criteria

### Audit & Functionality Verification
- [ ] `npm run build` succeeds without TypeScript or bundling errors.
- [ ] Baker percentage switch is strictly conditional on baking categories and syncs properly.
- [ ] Free users clicking Kiko voice button see the Melik+ upsell modal with matching design language and CTA to `/melik-plus`.
- [ ] Guest recipe migration modal triggers properly after sign up / log in when local recipes exist.
- [ ] Checkout attempt shows a branded payment gateway connection error message without crashing or breaking UI.
- [ ] Admin publishing an official recipe triggers a notification insertion for all active users in the database.

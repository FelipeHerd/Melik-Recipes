# Master Implementation Plan — Melik Recipes v2

## Objectives
Deliver all 6 requirements (R1 to R6) specified in `ORIGINAL_REQUEST.md`:

- **M1 (R1): Baker Calculator & Recipe Form Logic**
  - Make baker's percentage switch strictly conditional on baking/bread keywords in `RecipeFormModal.tsx` and `ViewRecipeModal.tsx`.
  - Synchronize baker percentage mode and calculator toggle.
  - Preserve math in `baker-calc.ts`.

- **M2 (R2): Melik+ Paywall & Kiko Voice Call UX**
  - Ensure Kiko voice button is visible across UI (`chef.tsx`, `ChefFab.tsx`, etc.).
  - Implement consistent upsell modal redirecting free users to `/melik-plus`.
  - Verify active Melik+ ElevenLabs voice interaction works properly.

- **M3 (R3): Guest Recipe Import Flow Preservation**
  - Verify and preserve guest recipe localStorage creation and post-login/signup import popup modal (`GuestMigrationModal.tsx`).
  - Seamlessly migrate recipes upon user confirmation.

- **M4 (R4): Payment Gateway Architecture Refactoring & Error State**
  - Refactor mock payment UI (`MelikPlusCheckoutModal.tsx`, `CreditCard3D.tsx`, `melik-plus.functions.ts`) into a type-safe payment gateway ready structure.
  - Show a branded, elegant payment provider connection error message on checkout attempt.

- **M5 (R5): Official Recipe Broadcast Notifications**
  - When an official recipe is created or published by an admin in `official-recipes.functions.ts` / `admin-notifications.functions.ts`, insert broadcast notifications for all active users in Supabase.

- **M6 (R6): Full Codebase Bug, Workflow & UI/UX Audit & Fixes**
  - Audit all routes, hooks, components, database functions.
  - Fix TypeScript errors, broken state logic, UI/UX flaws.
  - Ensure `npm run build` completes with 0 errors.

## Workflow Pipeline per Milestone
1. **Explorer**: Investigate codebase files, document current behavior, dependencies, and exact changes needed.
2. **Worker**: Implement changes, run build/typecheck/test commands.
3. **Reviewer & Challenger**: Review implementation code, challenge edge cases, verify compliance.
4. **Forensic Auditor**: Run static and runtime checks to ensure 100% integrity (no hardcoding, no cheating).
5. **Gate Check**: Validate all verdicts. Advance milestone upon unanimous PASS.

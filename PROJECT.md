# Project: Melik Recipes v2

## Architecture
- React + Vite + TanStack Router + Supabase + ElevenLabs WebRTC
- Modular frontend layout with type-safe server functions:
  - `src/components/`: UI components & modals (baker calc, paywall, guest migration, payment checkout)
  - `src/lib/`: Core business logic, pure calculations, server functions & Supabase integration
  - `src/routes/`: Route pages (Chef, Melik+, etc.)

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Baker Calculator Conditional Visibility & Sync | Baker switch strictly conditional on baking/bread categories in RecipeFormModal & ViewRecipeModal | M1 | R1 |
| 2 | Baker Calculator Math Preservation | Pure calculation logic in `baker-calc.ts` preserved intact | M1 | R1 |
| 3 | Kiko Voice Call UX & Button Visibility | Hands-free voice button visible across UI (`chef.tsx`, `ChefFab.tsx`) | M2 | R2 |
| 4 | Melik+ Voice Upsell Modal | Free users clicking voice call button get subtle, consistent upsell modal redirecting to `/melik-plus` | M2 | R2 |
| 5 | Active Melik+ Voice Call | Active Melik+ users can connect to ElevenLabs voice interaction | M2 | R2 |
| 6 | Guest Recipe Migration Flow | Guest recipe localStorage persistence (`meliks.recipes.guest.v1`) and post-login `GuestMigrationModal` | M3 | R3 |
| 7 | Payment Gateway Architecture Refactoring | Type-safe gateway structure (`PaymentProvider`, `PaymentGatewayError`, `GATEWAY_CONNECTION_ERROR`) in `melik-plus.functions.ts` & checkout modal | M4 | R4 |
| 8 | Branded Checkout Connection Error State | Elegant, branded payment connection error banner on checkout attempt | M4 | R4 |
| 9 | Official Recipe Broadcast Notifications | Broadcast notification insertion for all active user profiles when admin creates/publishes official recipe | M5 | R5 |
| 10 | Full Codebase Audit & Build Verification | Fix TypeScript errors, broken state logic, UI/UX issues, verify `npm run build` succeeds | M6 | R6 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Baker Calculator & Recipe Form Logic | Fix `ViewRecipeModal.tsx` & `RecipeFormModal.tsx` baking category guard & synchronized toggle | none | DONE |
| M2 | Melik+ Paywall & Kiko Voice Call UX | Add voice button to `ChefFab.tsx` & `chef.tsx`, add `KikoVoicePaywallModal` with CTA to `/melik-plus` | none | DONE |
| M3 | Guest Recipe Import Flow Preservation | Verify and preserve `GuestMigrationModal.tsx` and localStorage migration | none | DONE |
| M4 | Payment Gateway Architecture & Error State | Refactor `melik-plus.functions.ts` & `MelikPlusCheckoutModal.tsx` to type-safe payment gateway + connection error banner | none | DONE |
| M5 | Official Recipe Broadcast Notifications | Implement `broadcastOfficialRecipeNotification` in `recipes.functions.ts` or `official-recipes.functions.ts` | none | DONE |
| M6 | Full Codebase Audit & Build Verification | Fix lingering TypeScript/UI/UX bugs and verify `npm run build` passes with 0 errors | M1, M2, M3, M4, M5 | DONE |

## Interface Contracts
### `baker-calc.ts` ↔ UI Modals
- `isBakingCategory(category: string): boolean`
- `calculateBakerPercents(ingredients: Ingredient[]): Ingredient[]`

### Payment Gateway Architecture (`melik-plus.functions.ts`)
- `type PaymentProvider = 'stripe' | 'mercadopago' | 'mock'`
- `type PaymentGatewayErrorCode = 'GATEWAY_CONNECTION_ERROR' | 'CARD_DECLINED' | 'INVALID_PAYMENT_DETAILS'`
- `CheckoutTransactionRequest`: `{ billing: 'monthly' | 'yearly'; provider?: PaymentProvider }`
- `CheckoutTransactionResult`: `{ success: boolean; subscriptionId?: string; error?: PaymentGatewayError }`

### Official Recipe Broadcast (`recipes.functions.ts`)
- `broadcastOfficialRecipeNotification(recipeId: string, recipeTitle: string): Promise<{ success: boolean; recipientCount: number }>`

## Code Layout
- `src/components/RecipeFormModal.tsx`
- `src/components/ViewRecipeModal.tsx`
- `src/components/GuestMigrationModal.tsx`
- `src/components/MelikPlusCheckoutModal.tsx`
- `src/components/KikoVoicePaywallModal.tsx`
- `src/components/ChefFab.tsx`
- `src/routes/chef.tsx`
- `src/routes/melik-plus.tsx`
- `src/lib/baker-calc.ts`
- `src/lib/recipes-context.tsx`
- `src/lib/recipes.functions.ts`
- `src/lib/melik-plus.functions.ts`
- `src/lib/official-recipes.functions.ts`
- `src/lib/admin-notifications.functions.ts`

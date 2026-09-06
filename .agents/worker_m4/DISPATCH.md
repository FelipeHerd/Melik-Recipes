## 2026-08-13T15:53:00Z
You are Worker M4 for Milestone M4 (Payment Gateway Architecture Refactoring & Connection Error State).
Working directory: c:/Users/User/Desktop/El Peque/Melik/Melik Recipes/v2/v2_Melik Recipes/.agents/worker_m4

Please read:
- c:/Users/User/Desktop/El Peque/Melik/Melik Recipes/v2/v2_Melik Recipes/.agents/ORIGINAL_REQUEST.md
- c:/Users/User/Desktop/El Peque/Melik/Melik Recipes/v2/v2_Melik Recipes/PROJECT.md
- c:/Users/User/Desktop/El Peque/Melik/Melik Recipes/v2/v2_Melik Recipes/.agents/explorer_m4_1/analysis.md
- c:/Users/User/Desktop/El Peque/Melik/Melik Recipes/v2/v2_Melik Recipes/.agents/explorer_m4_2/analysis.md
- c:/Users/User/Desktop/El Peque/Melik/Melik Recipes/v2/v2_Melik Recipes/.agents/explorer_m4_3/analysis.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Task:
1. Refactor `src/lib/melik-plus.functions.ts` to export type-safe gateway contracts:
   - `export type PaymentProvider = 'stripe' | 'mercadopago' | 'mock'`
   - `export type PaymentGatewayErrorCode = 'GATEWAY_CONNECTION_ERROR' | 'CARD_DECLINED' | 'INVALID_PAYMENT_DETAILS' | 'PROVIDER_UNAVAILABLE' | 'UNKNOWN_ERROR'`
   - `export interface PaymentGatewayError { code: PaymentGatewayErrorCode; message: string; provider?: PaymentProvider; rawError?: unknown }`
   - `export interface CheckoutTransactionRequest { billing: 'monthly' | 'yearly'; provider?: PaymentProvider; cardDetails?: { name: string; number: string; expiry: string; cvc: string } }`
   - `export interface CheckoutTransactionResult { success: boolean; subscriptionId?: string; error?: PaymentGatewayError }`
   - Refactor checkout processing function (`simulateMelikPlusPayment` or new `processPaymentGatewayCheckout`) to return `{ success: false, error: { code: 'GATEWAY_CONNECTION_ERROR', message: '...', provider } }` when a payment attempt is submitted (simulating a provider connection error state as specified in requirement R4).
2. Refactor `src/components/MelikPlusCheckoutModal.tsx`:
   - Implement provider selection support (e.g. Stripe / MercadoPago provider options).
   - Display an elegant, branded payment connection error banner/alert component whenever checkout is attempted, showing clear messaging that connection with the payment gateway failed, along with an interactive Retry button while keeping the card visual and UI intact.
   - Improve form accessibility (`<form>`, label association, input names/ids, ARIA states).
3. Preserve `CreditCard3D.tsx` animation and styling.
4. Run `npm run build` using PowerShell to confirm 0 TypeScript and build errors.
5. Document all changes and build results in `c:/Users/User/Desktop/El Peque/Melik/Melik Recipes/v2/v2_Melik Recipes/.agents/worker_m4/handoff.md` and deliver your handoff report to the orchestrator.

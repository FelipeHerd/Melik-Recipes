# Handoff Report: Payment Gateway Architecture & Connection Error State (Milestone M4)

**Author:** Explorer M4-1  
**Target Recipient:** Orchestrator / Worker M4  
**Working Directory:** `c:/Users/User/Desktop/El Peque/Melik/Melik Recipes/v2/v2_Melik Recipes/.agents/explorer_m4_1`  
**Handoff Type:** Hard (Analysis Complete)

---

## 1. Observation

- **`src/lib/melik-plus.functions.ts`**:
  - `paymentSchema` (lines 12-15) is restricted to `z.object({ billing: z.enum(["monthly", "yearly"]), outcome: z.enum(["success", "error"]) })`.
  - `simulateMelikPlusPayment` (lines 17-74) handles mock payments by delaying 2000ms and throwing raw strings when `outcome === "error"`.
  - No explicit types exist for `PaymentProvider`, `PaymentGatewayError`, `PaymentGatewayErrorCode`, `CheckoutTransactionRequest`, or `CheckoutTransactionResult`.

- **`src/components/MelikPlusCheckoutModal.tsx`**:
  - `handleMock` (lines 68-80) catches thrown errors from `submitPayment` and sets `errorMsg` to a generic string `REJECTION_COPY`.
  - Lacks provider selection and dedicated branded UI component for connection errors (`GATEWAY_CONNECTION_ERROR`).

- **`src/routes/melik-plus.tsx`**:
  - Renders `<MelikPlusCheckoutModal open={...} billing={billing} />` (lines 196-200).

---

## 2. Logic Chain

1. **Premise**: Milestone M4 requires refactoring the mock payment setup into a type-safe gateway architecture prepared for integration with Stripe and MercadoPago without executing live payments, and displaying an elegant branded connection error message when connection errors occur.
2. **Analysis**:
   - Thrown raw string errors in TanStack Start server functions can cause unhandled RPC failures. Returning structured results (`CheckoutTransactionResult`) allows deterministic error handling.
   - Declaring `PaymentProvider = 'stripe' | 'mercadopago' | 'mock'` and `PaymentGatewayError = { code: 'GATEWAY_CONNECTION_ERROR', message: string, provider?: PaymentProvider }` satisfies feature contracts in `PROJECT.md`.
   - Returning `{ success: false, error: { code: 'GATEWAY_CONNECTION_ERROR', message: ... } }` from the server function enables `MelikPlusCheckoutModal` to render a branded connection error banner matching Melik Recipes' Ochre design system (`color-mix(in oklab, var(--ochre) ...)`).
3. **Conclusion**: Worker M4 can safely update `melik-plus.functions.ts` to export these payment types and return structured results, then update `MelikPlusCheckoutModal.tsx` to include provider selection and the `GatewayConnectionErrorBanner` component.

---

## 3. Caveats

- No live payment provider API keys or real SDKs (Stripe / MercadoPago) are being connected in this milestone, per prompt constraints ("Do not connect a live payment provider yet").
- All connection error states are handled via structured mock responses from the server function when selecting Stripe/MercadoPago or triggering `simulateOutcome: 'connection_error'`.

---

## 4. Conclusion

The investigation for Milestone M4 is complete. All payment types, server function response structures, Zod validation schemas, and UI error banner specifications have been fully detailed in `c:/Users/User/Desktop/El Peque/Melik/Melik Recipes/v2/v2_Melik Recipes/.agents/explorer_m4_1/analysis.md`.

---

## 5. Verification Method

1. Inspect `analysis.md` for exact interface signatures, Zod schemas, and step-by-step guidance.
2. Run `npm run build` after Worker M4 implementation to confirm 0 TypeScript or bundling errors.
3. Open `/melik-plus` in browser, initiate checkout with `stripe` or `mercadopago` provider selected, and verify that the branded Connection Error banner appears with Ochre branding and retry actions.

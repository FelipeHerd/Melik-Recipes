# Detailed Analysis Report: Payment Gateway Architecture & Connection Error State (M4)

**Explorer Agent**: Explorer M4-3  
**Milestone**: M4 (Payment Gateway Architecture & Connection Error State)  
**Date**: 2026-08-13  
**Target Files**:
- `src/lib/melik-plus.functions.ts`
- `src/components/MelikPlusCheckoutModal.tsx`
- `src/components/CreditCard3D.tsx`
- `src/routes/melik-plus.tsx`

---

## 1. Executive Summary

A comprehensive audit was performed on the payment gateway architecture, checkout modal UI, 3D card component, and associated server functions. 

**Key Finding**: The current payment implementation in `src/lib/melik-plus.functions.ts` and `src/components/MelikPlusCheckoutModal.tsx` is an informal mock simulator that lacks the interface contracts required by `PROJECT.md § Payment Gateway Architecture`. Furthermore, error handling currently discards server error payloads, lacks branded payment gateway connection error UI states (`GATEWAY_CONNECTION_ERROR`), contains unhandled async promise rejections on post-checkout navigation, and misses key accessibility (a11y) patterns.

---

## 2. Detailed Findings by Audit Category

### A. Interface Contract Non-Compliance (`PROJECT.md § Payment Gateway Architecture`)

`PROJECT.md` specifies the following required contract for `melik-plus.functions.ts`:
```ts
type PaymentProvider = 'stripe' | 'mercadopago' | 'mock';
type PaymentGatewayErrorCode = 'GATEWAY_CONNECTION_ERROR' | 'CARD_DECLINED' | 'INVALID_PAYMENT_DETAILS';
interface PaymentGatewayError {
  code: PaymentGatewayErrorCode;
  message: string;
  details?: string;
}
interface CheckoutTransactionRequest {
  billing: 'monthly' | 'yearly';
  provider?: PaymentProvider;
}
interface CheckoutTransactionResult {
  success: boolean;
  subscriptionId?: string;
  error?: PaymentGatewayError;
}
```

**Code Observations (`src/lib/melik-plus.functions.ts:12-74`)**:
- None of the required types (`PaymentProvider`, `PaymentGatewayErrorCode`, `PaymentGatewayError`, `CheckoutTransactionRequest`, `CheckoutTransactionResult`) are exported or defined.
- `paymentSchema` (lines 12–15) accepts only `{ billing: z.enum(["monthly", "yearly"]), outcome: z.enum(["success", "error"]) }`.
- `simulateMelikPlusPayment` returns `{ ok: true, premium_until, billing, paid_months_total }` or throws a generic untyped string error (`new Error("Pago rechazado por el emisor (simulado).")`).
- No provider parameter or provider connection status simulation is implemented.

---

### B. Missing Branded Payment Gateway Connection Error State (R4 & M4)

**Requirements**:
- **R4**: Implement an elegant, branded connection error message that displays whenever a user attempts to complete a checkout transaction, indicating a connection issue with the payment provider, while maintaining the app's visual identity.
- **M4 Acceptance Criteria**: Checkout attempt shows a branded payment gateway connection error message without crashing or breaking UI.

**Code Observations (`src/components/MelikPlusCheckoutModal.tsx:68-80, 198-205`)**:
- Currently, `handleMock("error")` sets generic text:
  `setErrorMsg("Error de simulación: Tu tarjeta fue rechazada. Intenta con otro método.")`.
- The error container (lines 198–205) is a standard red text paragraph (`border border-destructive/40 bg-destructive/10 text-destructive`).
- There is **no branded connection error banner** indicating provider gateway connection issues (`GATEWAY_CONNECTION_ERROR`), no provider icon, no ochre/brand-aligned banner layout, and no connection retry mechanism.

---

### C. Async Promise Handling & Exception Gaps

1. **Unhandled Promise Rejection in `handleGoToRecipes` (`src/components/MelikPlusCheckoutModal.tsx:82-86`)**:
   ```ts
   async function handleGoToRecipes() {
     await queryClient.invalidateQueries();
     onClose();
     navigate({ to: "/" });
   }
   ```
   If `invalidateQueries()` or `navigate()` fails or throws an exception, the rejection is unhandled.
   *Fix Recommendation*: Wrap with `try/catch` and route errors to `showError(err)`.

2. **Discarded Server Exception Payload (`src/components/MelikPlusCheckoutModal.tsx:68-80`)**:
   ```ts
   try {
     await submitPayment({ data: { billing, outcome } });
     setStatus("success");
   } catch {
     shakeKey.current += 1;
     setErrorMsg(REJECTION_COPY);
     setStatus("error");
   }
   ```
   The `catch` block discards the caught error object (`err`). If `submitPayment` throws a structured `PaymentGatewayError` or network connection error, the UI overwrites it with hardcoded mock text.
   *Fix Recommendation*: Extract `err` message or structured code (e.g. `GATEWAY_CONNECTION_ERROR`) and populate `errorMsg` or error object accordingly.

3. **Missing Component Unmount Safety**:
   If `MelikPlusCheckoutModal` unmounts while `submitPayment` is pending, state setters (`setStatus`, `setErrorMsg`) execute on unmounted state.

---

### D. UI Accessibility & HTML Structure Issues

1. **Missing `<form>` Element**:
   The checkout modal (lines 144–196) renders card number, holder, expiry, and CVV inputs inside a `div`, not a `<form>`. Pressing "Enter" in input fields does not trigger checkout submission.
2. **Missing Input Attributes & Explicit Label Linking**:
   `Field` component (lines 333–342) wraps inputs in `<label>` without `htmlFor` or `id` attributes on `<input>` elements. Form inputs lack `name` attributes for standard browser autocomplete and assistive technologies.
3. **Form Error State Accessibility**:
   When an error occurs, inputs do not receive `aria-invalid="true"` or `aria-describedby` referencing the error alert container.
4. **Success Screen Live Announcement**:
   The transition to `SuccessScreen` (line 118) occurs without an `aria-live="polite"` region, leaving screen reader users unnotified of the status transition.

---

### E. Audit of `CreditCard3D.tsx`

`src/components/CreditCard3D.tsx` is a pure presentational component with CSS 3D transforms (`perspective: 1000px`, `rotateY(180deg)`).
- **TypeScript Types**: Clean, explicit props (`number`, `holder`, `expiry`, `cvv`, `flipped`).
- **A11y**: Sets `aria-hidden` on top container to hide decorative visual card from screen readers (correct behavior).
- **Recommendation for M4**: Can be optionally enhanced with a subtle provider badge (e.g. Stripe / MercadoPago / Melik Pay badge) based on selected `PaymentProvider`.

---

## 3. Recommended Refactoring Plan for Implementer

1. **Refactor `src/lib/melik-plus.functions.ts`**:
   - Export types: `PaymentProvider`, `PaymentGatewayErrorCode`, `PaymentGatewayError`, `CheckoutTransactionRequest`, `CheckoutTransactionResult`.
   - Update Zod input schema to accept `CheckoutTransactionRequest` (including `provider` and optional `simulateError` / `simulateErrorCode`).
   - Standardize handler response to `CheckoutTransactionResult` with typed `PaymentGatewayError` (specifically supporting `GATEWAY_CONNECTION_ERROR`).

2. **Refactor `src/components/MelikPlusCheckoutModal.tsx`**:
   - Wrap input fields in a proper `<form onSubmit={...}>`.
   - Add provider selection (Stripe / MercadoPago / Mock).
   - Implement an elegant, branded payment gateway connection error banner with warning icon, brand styling (`var(--ochre)` accent), clear connection error message, and retry button when `error.code === 'GATEWAY_CONNECTION_ERROR'`.
   - Wrap `handleGoToRecipes` in `try/catch` with `showError`.
   - Add `id`, `name`, `aria-invalid`, and `aria-describedby` to form controls.

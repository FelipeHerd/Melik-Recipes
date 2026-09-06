# Technical Analysis: Payment Gateway Architecture & Connection Error State (Milestone M4)

**Author:** Explorer M4-1  
**Date:** 2026-08-13  
**Working Directory:** `c:/Users/User/Desktop/El Peque/Melik/Melik Recipes/v2/v2_Melik Recipes/.agents/explorer_m4_1`  
**Target Milestone:** M4 (Payment Gateway Architecture & Connection Error State)  
**Status:** Read-Only Investigation Complete

---

## 1. Executive Summary

This report establishes the payment gateway architecture and connection error handling specification for **Melik Recipes v2**. Currently, Melik+ payment processing relies on a simplified mock function (`simulateMelikPlusPayment`) inside `src/lib/melik-plus.functions.ts` and a mock checkout modal (`MelikPlusCheckoutModal.tsx`) that throws untyped strings upon error.

To prepare the codebase for multi-provider live payment integration (Stripe, MercadoPago, Mock) without incurring runtime crashes or visual breakage, we specify:
1. A strongly typed `PaymentProvider`, `PaymentGatewayError`, `CheckoutTransactionRequest`, and `CheckoutTransactionResult` interface contract.
2. Structured server function return types in `src/lib/melik-plus.functions.ts` returning `{ success: false, error: { code: 'GATEWAY_CONNECTION_ERROR', message: string } }` when connection issues occur.
3. An elegant, branded Connection Error banner and state in `MelikPlusCheckoutModal.tsx` matching Melik Recipes' Ochre design system (`color-mix(in oklab, var(--ochre) ...)`) with actionable retry capability.
4. Concrete step-by-step guidance for Worker M4.

---

## 2. Evidence Chain & Current Codebase Audit

### 2.1 File Evidence & Inspection

| File Path | Relevant Lines | Observation / Current Limitation |
|---|---|---|
| `src/lib/melik-plus.functions.ts` | 12-74 | `simulateMelikPlusPayment` uses a simple Zod schema `{ billing, outcome }` and throws raw string errors (`throw new Error("Pago rechazado...")`). Does not support provider selection or structured error codes. |
| `src/components/MelikPlusCheckoutModal.tsx` | 48-80 | `handleMock` calls `submitPayment({ data: { billing, outcome } })` and catches errors, displaying a generic rejection alert string `REJECTION_COPY`. Lacks provider tab switching and branded connection error state. |
| `src/routes/melik-plus.tsx` | 196-200 | Renders `<MelikPlusCheckoutModal open={...} billing={billing} />`. Does not yet pass provider props or handle structured gateway responses. |
| `src/routes/api/public/hooks/melik-plus-renew.ts` | 1-120 | Background cron endpoint for renewing active subscriptions and downgrading canceled ones. Uses `billing_cycle` from profile. Compatible with new types. |

### 2.2 Inconsistencies & Deficiencies Identified

1. **Lack of Type Contracts**: `PaymentProvider` and `PaymentGatewayError` types mentioned in `PROJECT.md` section "Interface Contracts" are not yet declared or exported in `src/lib/melik-plus.functions.ts` or `src/types/melik-plus.ts`.
2. **Unhandled Gateway Failure Modes**: The server function currently throws exceptions when an error occurs instead of returning structured `{ success: false, error: PaymentGatewayError }` results. Thrown exceptions across TanStack Start server functions can result in uncaught RPC rejections if not wrapped in standard result payloads.
3. **Missing Branded Error UX**: The existing checkout modal only has a generic text alert for simulation failure. It lacks a dedicated, branded error component for `GATEWAY_CONNECTION_ERROR` that displays provider details, network diagnostic messaging, and retry actions while remaining visually integrated with the app's dark/light ochre theme.

---

## 3. Target Architecture Specification

### 3.1 Type Contracts & Data Models

We recommend creating or updating types in `src/lib/melik-plus.functions.ts` (and re-exporting as appropriate):

```ts
/** Supported payment gateway providers */
export type PaymentProvider = 'stripe' | 'mercadopago' | 'mock';

/** Payment gateway error codes */
export type PaymentGatewayErrorCode =
  | 'GATEWAY_CONNECTION_ERROR'
  | 'CARD_DECLINED'
  | 'INVALID_PAYMENT_DETAILS'
  | 'PROVIDER_UNAVAILABLE'
  | 'UNKNOWN_ERROR';

/** Structured payment gateway error representation */
export type PaymentGatewayError = {
  code: PaymentGatewayErrorCode;
  message: string;
  provider?: PaymentProvider;
  details?: unknown;
};

/** Request payload for processing checkout transaction */
export type CheckoutTransactionRequest = {
  billing: 'monthly' | 'yearly';
  provider?: PaymentProvider;
  cardNumber?: string;
  cardHolder?: string;
  expiry?: string;
  cvv?: string;
  /** Controls simulation behavior for testing */
  simulateOutcome?: 'success' | 'connection_error' | 'card_declined';
};

/** Response payload from checkout transaction server function */
export type CheckoutTransactionResult = {
  success: boolean;
  subscriptionId?: string;
  premiumUntil?: string;
  paidMonthsTotal?: number;
  billing?: 'monthly' | 'yearly';
  provider?: PaymentProvider;
  error?: PaymentGatewayError;
};
```

### 3.2 Zod Validation Schema

In `src/lib/melik-plus.functions.ts`:

```ts
import { z } from "zod";

export const checkoutTransactionSchema = z.object({
  billing: z.enum(["monthly", "yearly"]),
  provider: z.enum(["stripe", "mercadopago", "mock"]).optional().default("mock"),
  cardNumber: z.string().optional(),
  cardHolder: z.string().optional(),
  expiry: z.string().optional(),
  cvv: z.string().optional(),
  simulateOutcome: z.enum(["success", "connection_error", "card_declined"]).optional(),
});
```

### 3.3 Server Function Behavior (`simulateMelikPlusPayment` / `processCheckoutTransaction`)

The server function must follow this logical workflow:

1. **Authentication Check**: Middleware `requireSupabaseAuth` ensures context contains `userId`.
2. **Provider & Network Simulation**:
   - Delay response by 1200ms - 2000ms to simulate network roundtrip to external payment gateway APIs.
3. **Gateway Connection Error Branch**:
   - If `data.provider === 'stripe'` or `data.provider === 'mercadopago'` (when live keys are absent), or if `data.simulateOutcome === 'connection_error'`, return structured error:
     ```ts
     if (data.provider === "stripe" || data.provider === "mercadopago" || data.simulateOutcome === "connection_error") {
       const providerName = data.provider === "stripe" ? "Stripe" : data.provider === "mercadopago" ? "MercadoPago" : "Servidor de pagos";
       return {
         success: false,
         provider: data.provider,
         error: {
           code: "GATEWAY_CONNECTION_ERROR",
           message: `No se pudo establecer conexión con la pasarela de pagos (${providerName}). Por favor verifica tu red e intenta nuevamente.`,
           provider: data.provider,
         },
       };
     }
     ```
4. **Card Declined Branch**:
   - If `data.simulateOutcome === 'card_declined'`:
     ```ts
     return {
       success: false,
       provider: data.provider,
       error: {
         code: "CARD_DECLINED",
         message: "Tu tarjeta fue rechazada por el banco emisor. Por favor intenta con otro método de pago.",
         provider: data.provider,
       },
     };
     ```
5. **Success Branch (`provider === 'mock'` or successful simulation)**:
   - Perform atomic profile update in Supabase via `supabaseAdmin`.
   - Update `is_premium: true`, `premium_until`, `subscription_status: "active"`, `paid_months_total`, `billing_cycle`.
   - Insert welcome notification via `sendTemplatedNotification`.
   - Return `{ success: true, subscriptionId: `sub_mock_${Date.now()}`, premiumUntil, paidMonthsTotal: nextTotal, billing: data.billing, provider: data.provider }`.

---

## 4. UI/UX Design Specification for Branded Connection Error State

### 4.1 Payment Gateway Selector in `MelikPlusCheckoutModal.tsx`

To allow users and testers to test both success flows and provider connection error states seamlessly, introduce a provider selection pill/tab control at the top of the modal:
- Options: **Mock (Pruebas)** | **Stripe** | **MercadoPago**
- When `Stripe` or `MercadoPago` is selected (or when connection error is triggered), submitting payment initiates the transaction and triggers the `GATEWAY_CONNECTION_ERROR` state.

### 4.2 Branded Connection Error Banner Component Specification

When `CheckoutTransactionResult` returns `{ success: false, error: { code: 'GATEWAY_CONNECTION_ERROR', ... } }`:

- **Component Name**: `GatewayConnectionErrorBanner`
- **Visual Style**:
  - Border: `border-2 border-[color:var(--ochre)]/40`
  - Background: `bg-[color:var(--ochre)]/10 dark:bg-[color:var(--ochre)]/15`
  - Text: High contrast readable text with Ochre header text.
  - Icon: `WifiOff` or `AlertTriangle` or `CloudOff` in `text-[color:var(--ochre)]`.
- **Content**:
  - Title: **Error de Conexión con la Pasarela**
  - Subtitle / Provider: `No se pudo conectar con ${providerName}`
  - Explanation: "No pudimos establecer comunicación segura con el servidor del proveedor de pagos. Tus datos están a salvo y no se realizó ningún cobro."
  - Action Button: **Reintentar conexión** (calls submit handler again) or **Cambiar método de pago**.

---

## 5. Step-by-Step Implementation Guidance for Worker M4

Worker M4 should execute the following steps in order:

### Step 1: Export Payment Types in `src/lib/melik-plus.functions.ts`
- Export `PaymentProvider`, `PaymentGatewayErrorCode`, `PaymentGatewayError`, `CheckoutTransactionRequest`, and `CheckoutTransactionResult`.
- Update `checkoutTransactionSchema` with Zod validation.

### Step 2: Refactor `simulateMelikPlusPayment` Server Function
- Accept `provider`, `billing`, and optional `simulateOutcome`.
- Return structured `CheckoutTransactionResult` for all outcomes (success, connection error, declined card) without throwing uncaught errors.
- Preserve atomic Supabase update logic for successful mock payments.

### Step 3: Enhance `MelikPlusCheckoutModal.tsx`
- Add provider selection control (`stripe` / `mercadopago` / `mock`).
- Handle structured server function responses (`res.success` vs `res.error`).
- Render `GatewayConnectionErrorBanner` when `res.error.code === 'GATEWAY_CONNECTION_ERROR'`.
- Ensure animations (`melik-shake`), inputs disabled state, loading states, and keyboard/focus accessibility (`useModalA11y`) work flawlessly.

### Step 4: Verify Component & Page Integration
- Test flow in `src/routes/melik-plus.tsx`.
- Verify that attempting a checkout via Stripe or MercadoPago displays the branded connection error banner gracefully without crashing.
- Verify `npm run build` succeeds with 0 TypeScript or bundling errors.

---

## 6. Verification Method

1. **Static Analysis & Type Check**:
   - Run `npx tsc --noEmit` or `npm run build` to verify type safety across `melik-plus.functions.ts` and `MelikPlusCheckoutModal.tsx`.
2. **Interactive Testing**:
   - Open `/melik-plus` in browser.
   - Click "Comenzar ahora" to open `MelikPlusCheckoutModal`.
   - Trigger a checkout transaction with provider set to `stripe` or `mercadopago` or `simulateOutcome: 'connection_error'`.
   - Confirm that the modal renders the branded connection error banner with Ochre theme styling, network explanation, and retry button without closing or crashing.
   - Trigger a successful payment with provider `mock` and confirm subscription activation screen appears.

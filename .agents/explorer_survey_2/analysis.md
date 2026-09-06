# Melik Recipes v2 — Explorer Survey Analysis (R3 & R4)

**Investigator**: Explorer 2  
**Date**: 2026-08-13  
**Working Directory**: `c:/Users/User/Desktop/El Peque/Melik/Melik Recipes/v2/v2_Melik Recipes/.agents/explorer_survey_2`  

---

## Executive Summary

This report presents a comprehensive technical audit of the Melik Recipes v2 codebase for two specific requirements:
1. **R3: Guest Recipe Import Flow Preservation**
2. **R4: Payment Gateway Architecture Refactoring & Error State**

All examined components, server functions, hooks, type definitions, and routes have been mapped in detail with exact file paths, line numbers, state variables, data flow diagrams, identified bugs/anti-patterns, and proposed refactoring plans.

---

## Part 1: Requirement R3 — Guest Recipe Import Flow Preservation

### 1.1 Overview & Requirements
- **Goal**: Verify and preserve the guest recipe localStorage creation, storage normalization, post-login/signup detection, and modal import flow (`GuestMigrationModal.tsx`).
- **Core Files Involved**:
  - `src/components/GuestMigrationModal.tsx`
  - `src/lib/recipes-context.tsx`
  - `src/lib/recipes.functions.ts`
  - `src/routes/__root.tsx`
  - `src/routes/auth.tsx`
  - `src/components/SignUpForm.tsx`

---

### 1.2 Detailed Component & Function Code Analysis

#### A. Storage Configuration & Keys (`src/lib/recipes-context.tsx`)
- **Lines 58–60**:
  ```typescript
  const GUEST_KEY = "meliks.recipes.guest.v1";
  const LEGACY_KEY = "meliks.recipes.v1";
  const MAX_GUEST_IMAGE_BYTES = 1_000_000; // ~1 MB — keep localStorage sane
  ```
- **Key Functions**:
  - `loadGuest()` (**lines 84–96**):
    ```typescript
    function loadGuest(): Recipe[] {
      if (typeof window === "undefined") return [];
      try {
        window.localStorage.removeItem(LEGACY_KEY);
        const raw = window.localStorage.getItem(GUEST_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.map(normalizeGuestRecipe).filter((r): r is Recipe => r !== null);
      } catch {
        return [];
      }
    }
    ```
    - *Behavior*: Automatically purges legacy storage (`LEGACY_KEY`), reads `GUEST_KEY`, parses JSON array, normalizes each item via `normalizeGuestRecipe`, and filters out invalid objects safely.
  - `saveGuest(recipes: Recipe[])` (**lines 98–105**): Writes guest recipes array to `localStorage` under `GUEST_KEY`. Catches quota errors gracefully.
  - `clearGuestStorage()` (**lines 107–115**): Removes both `GUEST_KEY` and `LEGACY_KEY` from `localStorage`.

#### B. Guest Recipe Creation Flow (`src/lib/recipes-context.tsx`)
- **Lines 224–289 (`addRecipe`)**:
  - Unauthenticated mode (`!userId`):
    - Validates image file size: `imageFile.size > MAX_GUEST_IMAGE_BYTES` throws an error prompting the user to sign in for larger uploads.
    - Encodes file to Base64 `data:` URL using `readFileAsDataUrl(imageFile)`.
    - Generates client UUID via `crypto.randomUUID()`.
    - Prepends recipe to `guest` state:
      ```typescript
      setGuest((prev) => [
        {
          ...rest,
          emoji,
          id: crypto.randomUUID(),
          createdAt: Date.now(),
          imageUrl,
          imagePath: null,
          isBakerMode: !!rest.isBakerMode,
          isDraft: false,
          isPublic: false,
          originalAuthor: null,
        },
        ...prev,
      ]);
      ```
    - Synchronizes `guest` state with `localStorage` via `useEffect` (**lines 190–194**).

#### C. Auth Lifecycle & Migration Trigger (`src/lib/recipes-context.tsx`)
- **Lines 150–188**:
  - On app mount (`supabase.auth.getUser()`):
    ```typescript
    if (uid) {
      const pending = loadGuest();
      if (pending.length > 0) setPendingGuestMigration(pending);
    }
    ```
  - On auth state change (`onAuthStateChange`):
    ```typescript
    if (event === "SIGNED_IN" && newId) {
      const pending = loadGuest();
      if (pending.length > 0) {
        setPendingGuestMigration(pending);
      }
      queryClient.removeQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["recipes"] });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    }
    if (event === "SIGNED_OUT") {
      setPendingGuestMigration([]);
      queryClient.removeQueries({ queryKey: ["recipes"] });
      queryClient.removeQueries({ queryKey: ["profile"] });
      queryClient.removeQueries({ queryKey: ["notifications"] });
    }
    ```

#### D. Modal UI Component (`src/components/GuestMigrationModal.tsx`)
- Mounted globally in `RootComponent()` (**src/routes/__root.tsx:359**).
- Reads `{ pendingGuestMigration, confirmMigration, discardMigration }` from `useRecipes()`.
- **Condition**: Returns `null` if `!hasPendingMigration`.
- **Keyboard A11y**: Uses `useModalA11y(() => {}, hasPendingMigration)` with an intentional empty handler so `Escape` key does not dismiss the modal without an explicit user choice.
- **Actions**:
  - **Confirm** (`onConfirm`): Calls `confirmMigration()`. Displays success toast: `Se importaron ${inserted} recetas a tu cuenta`.
  - **Discard** (`onDiscard`): Calls `discardMigration()`. Displays message toast: `Recetas de invitado descartadas`.

#### E. Migration Execution & Backend Import (`src/lib/recipes-context.tsx` & `src/lib/recipes.functions.ts`)
- **`confirmMigration()` (`src/lib/recipes-context.tsx:319–363`)**:
  1. Checks if `pendingGuestMigration` is empty.
  2. For recipes with Base64 `imageUrl` (`data:`), converts Base64 back into a `File` blob and uploads it to Supabase Storage via `uploadRecipeImage`.
  3. Prepares structured payload `withUploads` (ingredients, instructions with optional step images, baker mode, category, time).
  4. Invokes server function `migrateGuestRecipes({ data: { recipes: withUploads } })`.
  5. On success:
     - Clears `localStorage` (`clearGuestStorage()`).
     - Clears `guest` state (`setGuest([])`).
     - Clears `pendingGuestMigration` state (`setPendingGuestMigration([])`).
     - Invalidates `["recipes"]` React Query key so cloud recipes reload instantly.
- **`migrateGuestRecipes` Server Function (`src/lib/recipes.functions.ts:361–372`)**:
  - Middleware: `requireSupabaseAuth`.
  - Input Schema: `z.object({ recipes: z.array(recipeInputSchema).max(500) })`.
  - Maps items to DB columns: `{ user_id: context.userId, ...rowToDbColumns(r) }`.
  - Executes batch insert: `context.supabase.from("recipes").insert(rows, { count: "exact" })`.

---

### 1.3 State & Data Flow Summary (R3)

```
[Guest User] -> Creates Recipe -> Saved to localStorage ("meliks.recipes.guest.v1")
                                           |
                                  [User Signs In / Signs Up]
                                           |
                              onAuthStateChange("SIGNED_IN")
                                           |
                           loadGuest() finds > 0 recipes
                                           |
                        setPendingGuestMigration(recipes)
                                           |
                        <GuestMigrationModal /> appears
                        /                               \
           [User Clicks "Sí, importar"]       [User Clicks "No, descartar"]
                      |                                     |
   1. Base64 images -> Storage upload            1. clearGuestStorage()
   2. migrateGuestRecipes() RPC call             2. setPendingGuestMigration([])
   3. clearGuestStorage()                        3. Toast: "Recetas descartadas"
   4. setPendingGuestMigration([])
   5. Invalidate ["recipes"] cache
   6. Toast: "Se importaron N recetas"
```

---

### 1.4 Identified Findings & Minor Code Issues (R3)

1. **Comment Discrepancy in `GuestMigrationModal.tsx:75–76`**:
   - **Code**:
     ```tsx
     {/* Non-functional X to hint dismissal path */}
     <button
       type="button"
       onClick={onDiscard}
       disabled={busy}
       aria-label="Descartar recetas de invitado"
       className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-xl text-foreground/50 hover:bg-card"
     >
       <X className="h-4 w-4" />
     </button>
     ```
   - **Observation**: The comment states "Non-functional X", but `onClick={onDiscard}` IS functional and calls `discardMigration()`. The comment should be updated to clarify that top-right X acts as a discard shortcut.

2. **Flow Robustness Assessment**:
   - Storage handling, JSON normalization, base64 image migration to cloud storage, and cache invalidation are **extremely robust**.
   - Edge case check: If user closes browser tab while modal is displayed, `localStorage` remains intact. Upon next session/login, `loadGuest()` will trigger the modal again. No data loss occurs.

---

## Part 2: Requirement R4 — Payment Gateway Architecture Refactoring & Error State

### 2.1 Overview & Requirements
- **Goal**: Refactor current mock payment UI (`MelikPlusCheckoutModal.tsx`, `CreditCard3D.tsx`, `melik-plus.functions.ts`) into a robust, type-safe architecture prepared for payment gateway integration (e.g. Stripe / MercadoPago structure). Do not connect live payment providers yet. Implement an elegant, branded connection error message when a user attempts a checkout transaction, indicating a connection issue with the payment provider while preserving Melik's visual identity.
- **Core Files Involved**:
  - `src/components/MelikPlusCheckoutModal.tsx`
  - `src/components/CreditCard3D.tsx`
  - `src/lib/melik-plus.functions.ts`
  - `src/routes/melik-plus.tsx`
  - `src/components/PaywallModal.tsx`

---

### 2.2 Current Code Audit & Flaws

#### A. Current `MelikPlusCheckoutModal.tsx` (**lines 1–245**)
- **State**:
  - `number`, `holder`, `expiry`, `cvv`, `flipped`
  - `status`: `"idle" | "loading-success" | "loading-error" | "success" | "error"`
  - `errorMsg`: `string | null`
- **Flaw 1 (Mock Simulation Buttons)**:
  - Lines 208–234 contain two explicit dev/mock buttons:
    ```tsx
    <button onClick={() => handleMock("success")}>Simular Pago Exitoso</button>
    <button onClick={() => handleMock("error")}>Simular Pago Rechazado</button>
    ```
  - This design does not look like a production checkout. It lacks a primary, unified "Pagar $15.000 COP" checkout submit action.
- **Flaw 2 (Lack of Gateway Abstraction)**:
  - Directly calls `simulateMelikPlusPayment({ data: { billing, outcome } })`.
  - There are no provider types, payment gateway request/response interfaces, or provider error codes (e.g., `GATEWAY_CONNECTION_ERROR`).
- **Flaw 3 (Generic Error Message)**:
  - Error state displays a basic red paragraph text:
    `"Error de simulación: Tu tarjeta fue rechazada. Intenta con otro método."`
  - R4 requires an **elegant, branded connection error message** indicating a connection issue with the payment provider (Stripe / MercadoPago) while maintaining Melik's visual identity.

#### B. Current `melik-plus.functions.ts` (**lines 1–75**)
- **`simulateMelikPlusPayment`**:
  ```typescript
  const paymentSchema = z.object({
    billing: z.enum(["monthly", "yearly"]),
    outcome: z.enum(["success", "error"]),
  });
  ```
- **Flaw**: Hardcoded 2000ms delay with `outcome` parameter directly deciding success vs error. Lacks structured payment provider gateway context or connection status handling.

#### C. Current `CreditCard3D.tsx` (**lines 1–156**)
- **Audit**: Native CSS 3D flip card component using `perspective: 1000px`, `transformStyle: preserve-3d`, backface visibility hidden, ochre gradient styling.
- **Assessment**: Component code is clean, highly polished, and visually compliant with the design system. It handles front and back views based on `flipped` state when focusing the CVV input field.

#### D. Current `PaywallModal.tsx` (**lines 34–36**)
- **Observation**: Clicking "Suscribirme" shows `toast.info("Próximamente")` instead of navigating to `/melik-plus`.
- **Recommendation**: Align `PaywallModal.tsx` CTA to navigate directly to `/melik-plus` so user reaches the checkout modal.

---

### 2.3 Proposed Type-Safe Payment Gateway Architecture (R4 Refactoring Plan)

To meet R4, we must establish a clear type-safe provider structure while preserving the ability to simulate connection errors cleanly.

#### 1. Type Definitions (`src/lib/payment-gateway.ts` or in `melik-plus.functions.ts`)

```typescript
export type PaymentProvider = "stripe" | "mercadopago" | "mock";
export type BillingCycle = "monthly" | "yearly";

export type CardPaymentDetails = {
  cardNumber: string; // Sanitized 16 digits
  cardHolder: string;
  expiryMonth: string;
  expiryYear: string;
  cvv: string;
};

export type CheckoutTransactionRequest = {
  billing: BillingCycle;
  provider?: PaymentProvider;
  cardDetails?: CardPaymentDetails;
  /** Optional flag for dev testing / simulator mode */
  simulateMode?: "gateway_error" | "card_declined" | "success";
};

export type PaymentErrorCode =
  | "GATEWAY_CONNECTION_ERROR"
  | "PROVIDER_NOT_CONFIGURED"
  | "PAYMENT_DECLINED"
  | "INVALID_CARD_DATA"
  | "TIMEOUT";

export type PaymentGatewayError = {
  code: PaymentErrorCode;
  message: string;
  provider: PaymentProvider;
  retryable: boolean;
};

export type CheckoutTransactionResponse =
  | {
      ok: true;
      transactionId: string;
      provider: PaymentProvider;
      premiumUntil: string;
      paidMonthsTotal: number;
    }
  | {
      ok: false;
      error: PaymentGatewayError;
    };
```

#### 2. Backend Gateway Handler (`src/lib/melik-plus.functions.ts`)

Refactor `simulateMelikPlusPayment` or introduce `processMelikPlusCheckout`:

```typescript
export const processMelikPlusCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => checkoutRequestSchema.parse(input))
  .handler(async ({ data, context }): Promise<CheckoutTransactionResponse> => {
    const provider: PaymentProvider = data.provider ?? "stripe";

    // Simulate gateway network handshaking
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Gateway connection error simulation (or live fallback when credentials missing)
    if (data.simulateMode === "gateway_error" || !process.env.STRIPE_SECRET_KEY) {
      return {
        ok: false,
        error: {
          code: "GATEWAY_CONNECTION_ERROR",
          message: `No pudimos establecer conexión con la pasarela de pagos (${provider.toUpperCase()}).`,
          provider,
          retryable: true,
        },
      };
    }

    // Success path implementation (activates profile premium state)
    // ...
  });
```

#### 3. Branded Connection Error Banner Component (`MelikPlusCheckoutModal.tsx`)

When checkout fails due to `GATEWAY_CONNECTION_ERROR` (or when user attempts payment without connected provider keys), render a dedicated, branded error card matching Melik's visual design:

```tsx
function GatewayConnectionErrorAlert({
  provider,
  message,
  onRetry,
}: {
  provider: string;
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="mt-4 rounded-2xl border border-[color:var(--ochre)]/40 bg-[color:var(--ochre)]/10 p-4 text-left backdrop-blur-sm animate-fade-in">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[color:var(--ochre)]/20 text-[color:var(--ochre)]">
          <WifiOff className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h4 className="font-display text-sm font-semibold text-foreground">
            Error de conexión con el proveedor de pagos
          </h4>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
            {message || "No fue posible conectar con la pasarela en este momento. Tu tarjeta no ha sido cobrada."}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-[color:var(--ochre)] px-3 text-xs font-semibold text-black hover:brightness-105"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Reintentar conexión
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

#### 4. Unified Checkout Form UX (`MelikPlusCheckoutModal.tsx`)
- Single primary CTA button: **"Pagar $15.000 COP"** (or $144.000 COP for yearly).
- Validates card inputs (16-digit card number, MM/YY expiration, 3-4 digit CVV, Holder Name).
- Shows loading state: `Procesando pago seguro...`.
- On error (connection issue with payment provider), displays the branded connection error banner without closing the modal or breaking UI state.

---

## Part 3: Synthesis & Implementation Action Plan

| Requirement | Affected Files | Proposed Changes |
|---|---|---|
| **R3: Guest Migration** | `GuestMigrationModal.tsx`, `recipes-context.tsx`, `recipes.functions.ts` | 1. Preserve existing migration pipeline (`loadGuest`, `confirmMigration`, Base64 image upload, `migrateGuestRecipes`).<br>2. Update comment in `GuestMigrationModal.tsx:75` to accurately describe dismissal action.<br>3. Ensure no regressions during auth sign-up/login. |
| **R4: Payment Gateway Refactoring** | `MelikPlusCheckoutModal.tsx`, `CreditCard3D.tsx`, `melik-plus.functions.ts` | 1. Create type-safe Payment Gateway interfaces and error types (`PaymentProvider`, `PaymentGatewayError`, `GATEWAY_CONNECTION_ERROR`).<br>2. Refactor `melik-plus.functions.ts` to process structured payment requests.<br>3. Replace dual mock simulation buttons in `MelikPlusCheckoutModal.tsx` with unified payment submit button.<br>4. Design and implement `GatewayConnectionErrorAlert` component for payment connection errors. |

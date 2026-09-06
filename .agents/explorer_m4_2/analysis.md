# Milestone M4 Analysis Report: Payment Gateway Architecture & Connection Error State (UI/UX Component Design)

**Explorer**: Explorer M4-2  
**Working Directory**: `c:\Users\User\Desktop\El Peque\Melik\Melik Recipes\v2\v2_Melik Recipes\.agents\explorer_m4_2`  
**Date**: 2026-08-13  
**Target Files**: `src/components/MelikPlusCheckoutModal.tsx`, `src/components/CreditCard3D.tsx`, `src/routes/melik-plus.tsx`

---

## Executive Summary
This report analyzes the Melik+ checkout frontend architecture, current loading & error states, and designs an **amber/red branded Payment Gateway Connection Error Alert component** to be integrated into `MelikPlusCheckoutModal.tsx`. It provides complete implementation specifications for Worker M4.

---

## 1. Existing Checkout Architecture Analysis

### A. Component Inventory & Responsibilities
1. **`src/routes/melik-plus.tsx`**
   - Host route for the Melik+ landing page.
   - Manages billing toggle state (`billing: "monthly" | "yearly"`).
   - Controls checkout modal visibility (`checkoutOpen`).
   - Enforces authentication guard: unauthenticated users clicking CTA are redirected to `/auth?redirect=/melik-plus`.

2. **`src/components/CreditCard3D.tsx`**
   - Purely presentational 3D banking card.
   - Uses native CSS 3D transforms (`perspective: 1000px`, `transformStyle: preserve-3d`, `backfaceVisibility: hidden`, `rotateY(180deg)`).
   - Formats card number into 4-digit groups with bullet placeholders (`••••`).
   - Flips to the reverse side showing CVV when the CVV input is focused.

3. **`src/components/MelikPlusCheckoutModal.tsx`**
   - Portal-based modal (`z-[60]`) with accessibility hooks (`useModalA11y`).
   - Current status state: `"idle" | "loading-success" | "loading-error" | "success" | "error"`.
   - Form state: `number`, `holder`, `expiry`, `cvv`, `flipped`.
   - Current error handling: Uses `shakeKey` ref to trigger CSS shake animation (`melik-shake`), setting `errorMsg` string and rendering a basic generic red paragraph:
     ```tsx
     <p role="alert" className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
       {errorMsg}
     </p>
     ```

---

## 2. Form Submission, Loading, and Error State Lifecycle

```
[ Idle State ] 
   │
   ├── User inputs card data or clicks "Simular Pago Rechazado" / "Pagar"
   │
[ Loading State ] (status = "loading-error" / "loading-success")
   │ ├── Disables inputs & action buttons (inputsDisabled = true)
   │ └── Displays spinning Loader2 icon in active submit button
   │
[ Response Received ]
   ├── Success (status = "success") ──> Shows SuccessScreen with animated checkmark & confetti
   │
   └── Connection Error / Declined (status = "error")
       ├── Triggers dialog shake animation (melik-shake)
       └── Renders Branded PaymentConnectionErrorAlert
```

---

## 3. UI/UX Design: Branded Payment Gateway Connection Error Alert

### Design System & Visual Palette
- **Primary Ochre Accent**: `var(--ochre)` (`#D4AF37` / `#B8860B`)
- **Warning Gradient Accent**: `from-amber-500/15 via-red-500/10 to-card`
- **Border**: `border-amber-500/40 dark:border-amber-500/30`
- **Text**: `text-amber-700 dark:text-amber-300` (Title) and `text-foreground/90` (Body)
- **Icons** (`lucide-react`): `WifiOff`, `AlertTriangle`, `RefreshCw`

### Proposed React Component: `PaymentConnectionErrorAlert`

```tsx
import { AlertTriangle, RefreshCw, WifiOff } from "lucide-react";

interface PaymentConnectionErrorAlertProps {
  errorDetails?: {
    code?: string;
    message?: string;
    provider?: string;
  } | null;
  onRetry: () => void;
  isRetrying?: boolean;
}

export function PaymentConnectionErrorAlert({
  errorDetails,
  onRetry,
  isRetrying = false,
}: PaymentConnectionErrorAlertProps) {
  const providerName = errorDetails?.provider || "Pasarela de Pagos";
  const displayMsg =
    errorDetails?.message ||
    `No fue posible establecer una conexión segura con la pasarela de pagos (${providerName}). Por favor, verifica tu conexión a internet o reintenta en unos instantes.`;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="mt-4 rounded-2xl border border-amber-500/40 bg-gradient-to-br from-amber-500/15 via-red-500/10 to-card p-4 shadow-sm backdrop-blur-sm animate-fade-in"
    >
      <div className="flex items-start gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-amber-500/30 bg-amber-500/20 text-amber-600 dark:text-amber-400">
          <WifiOff className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-display text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
              Error de Conexión
            </h3>
            <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-mono font-medium text-amber-700 dark:text-amber-300">
              GATEWAY_CONNECTION_ERROR
            </span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-foreground/85">
            {displayMsg}
          </p>
          <button
            type="button"
            onClick={onRetry}
            disabled={isRetrying}
            className="mt-3 flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/20 px-3 text-xs font-semibold text-amber-700 transition hover:bg-amber-500/30 active:scale-[0.98] dark:text-amber-300 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRetrying ? "animate-spin" : ""}`} />
            {isRetrying ? "Reintentando conexión..." : "Reintentar conexión con el proveedor"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

---

## 4. Step-by-Step Frontend Implementation Plan for Worker M4

### Step 1: Update Imports in `src/components/MelikPlusCheckoutModal.tsx`
Add `AlertTriangle`, `RefreshCw`, and `WifiOff` from `lucide-react`:
```tsx
import { AlertTriangle, Check, Crown, Loader2, RefreshCw, WifiOff, X } from "lucide-react";
```

### Step 2: Define Connection Error Component or Sub-component
Place `PaymentConnectionErrorAlert` inside `MelikPlusCheckoutModal.tsx` or as a co-located exported component.

### Step 3: Enhance State Machine in `MelikPlusCheckoutModal.tsx`
- Replace single string `errorMsg` with structured error state or handle connection error status:
  ```tsx
  type PaymentErrorCode = 'GATEWAY_CONNECTION_ERROR' | 'CARD_DECLINED' | 'INVALID_PAYMENT_DETAILS';
  const [gatewayError, setGatewayError] = useState<{ code: PaymentErrorCode; message: string; provider?: string } | null>(null);
  ```
- In `handleMock` or `handlePaymentSubmit`:
  ```tsx
  async function handleMock(outcome: "success" | "error") {
    if (isLoading) return;
    setGatewayError(null);
    setStatus(outcome === "success" ? "loading-success" : "loading-error");
    try {
      const res = await submitPayment({ data: { billing, outcome } });
      if (!res.success && res.error) {
        shakeKey.current += 1;
        setGatewayError(res.error);
        setStatus("error");
      } else {
        setStatus("success");
      }
    } catch (err: any) {
      shakeKey.current += 1;
      setGatewayError({
        code: "GATEWAY_CONNECTION_ERROR",
        message: "No fue posible establecer una conexión segura con la pasarela de pagos. Por favor, reintente en unos momentos.",
        provider: "Stripe",
      });
      setStatus("error");
    }
  }
  ```

### Step 4: Render `PaymentConnectionErrorAlert` in the Dialog
Replace the existing basic `<p role="alert">` block:
```tsx
{status === "error" && (
  <PaymentConnectionErrorAlert
    errorDetails={gatewayError}
    onRetry={() => handleMock("error")}
    isRetrying={status === "loading-error"}
  />
)}
```

---

## 5. Verification Method for Worker M4 & Challenger M4

1. Launch application: `npm run dev`.
2. Navigate to `/melik-plus` route.
3. Open `MelikPlusCheckoutModal` by clicking "Comenzar ahora".
4. Click "Simular Pago Rechazado" (or test connection failure outcome).
5. Verify:
   - Dialog executes smooth shake animation (`melik-shake`).
   - The branded amber/red `PaymentConnectionErrorAlert` renders smoothly.
   - Text clearly indicates inability to connect securely with payment gateway.
   - Code badge `GATEWAY_CONNECTION_ERROR` is shown.
   - "Reintentar conexión con el proveedor" button exhibits loader spin when clicked and triggers retry logic.

// Checkout de Melik+ con arquitectura de pasarelas de pago (Stripe, MercadoPago, Mock).
// R4 / M4: Incluye selector de proveedor, componente de error de conexión con la pasarela
// (GATEWAY_CONNECTION_ERROR) con botón de reintento, animación 3D de tarjeta preservada, y accesibilidad.

import { FormEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  Check,
  Crown,
  CreditCard,
  Loader2,
  RefreshCw,
  WifiOff,
  X,
} from "lucide-react";
import { useModalA11y } from "@/hooks/use-modal-a11y";
import { CreditCard3D } from "@/components/CreditCard3D";
import {
  simulateMelikPlusPayment,
  type PaymentProvider,
  type PaymentGatewayError,
} from "@/lib/melik-plus.functions";
import { showError } from "@/lib/errors/toast";

export type Billing = "monthly" | "yearly";

const PLAN_LABEL: Record<Billing, string> = {
  monthly: "Suscripción Melik+ Mensual — $15.000 COP",
  yearly: "Suscripción Melik+ Anual — $144.000 COP",
};

type Status = "idle" | "loading-success" | "loading-error" | "success" | "error";

export function MelikPlusCheckoutModal({
  open,
  onClose,
  billing,
}: {
  open: boolean;
  onClose: () => void;
  billing: Billing;
}) {
  useModalA11y(onClose, open);

  const [provider, setProvider] = useState<PaymentProvider>("stripe");
  const [number, setNumber] = useState("");
  const [holder, setHolder] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  const [flipped, setFlipped] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [gatewayError, setGatewayError] = useState<PaymentGatewayError | null>(null);

  // Aumenta en cada rechazo/error para reejecutar la animación shake.
  const shakeKey = useRef(0);

  const submitPayment = useServerFn(simulateMelikPlusPayment);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Reset al cerrar.
  useEffect(() => {
    if (!open) {
      setProvider("stripe");
      setNumber("");
      setHolder("");
      setExpiry("");
      setCvv("");
      setFlipped(false);
      setStatus("idle");
      setGatewayError(null);
    }
  }, [open]);

  const isLoading = status === "loading-success" || status === "loading-error";
  const inputsDisabled = isLoading || status === "success";

  async function handlePaymentSubmit(
    e?: FormEvent,
    overrideOutcome?: "success" | "error" | "connection_error" | "card_declined",
  ) {
    if (e) e.preventDefault();
    if (isLoading) return;

    setGatewayError(null);

    // Determine simulation intent
    const outcome = overrideOutcome ?? (provider === "mock" ? "success" : "connection_error");

    setStatus(outcome === "success" ? "loading-success" : "loading-error");

    try {
      const res = await submitPayment({
        data: {
          billing,
          provider,
          outcome,
          cardDetails: {
            name: holder,
            number,
            expiry,
            cvc: cvv,
          },
        },
      });

      if (!res.success && res.error) {
        shakeKey.current += 1;
        setGatewayError(res.error);
        setStatus("error");
      } else {
        setStatus("success");
      }
    } catch (err: unknown) {
      shakeKey.current += 1;
      setGatewayError({
        code: "GATEWAY_CONNECTION_ERROR",
        message:
          "No fue posible comunicarse con el servidor de la pasarela de pagos. Por favor verifica tu conexión e intenta de nuevo.",
        provider,
        rawError: err instanceof Error ? err.message : String(err),
      });
      setStatus("error");
    }
  }

  async function handleGoToRecipes() {
    try {
      await queryClient.invalidateQueries();
      onClose();
      await navigate({ to: "/" });
    } catch (err) {
      showError(err);
    }
  }

  if (!open) return null;
  if (typeof document === "undefined") return null;

  const dialogClass =
    "relative w-full max-w-md rounded-3xl border border-[color:var(--ochre)]/50 bg-background p-6 shadow-2xl max-h-[90dvh] overflow-y-auto" +
    (status === "error" ? " melik-shake" : "");

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="melik-plus-checkout-title"
      className="fixed inset-0 z-[60] flex items-end justify-center bg-foreground/40 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <style>{SHAKE_CSS}</style>
      <div key={shakeKey.current} onClick={(e) => e.stopPropagation()} className={dialogClass}>
        <button
          type="button"
          aria-label="Cerrar"
          onClick={onClose}
          className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-xl text-foreground/60 hover:bg-card hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        {status === "success" ? (
          <SuccessScreen onGoToRecipes={handleGoToRecipes} />
        ) : (
          <>
            <div className="flex items-center gap-2 text-[color:var(--ochre)]">
              <Crown className="h-5 w-5" />
              <span className="text-xs font-semibold uppercase tracking-widest">Melik+</span>
            </div>
            <h2
              id="melik-plus-checkout-title"
              className="mt-2 font-display text-2xl font-semibold leading-tight"
            >
              Confirmar suscripción
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{PLAN_LABEL[billing]}</p>

            {/* Provider Selector Tabs */}
            <div className="mt-4">
              <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Pasarela de Pago
              </label>
              <div
                role="tablist"
                aria-label="Seleccionar proveedor de pago"
                className="grid grid-cols-3 gap-1.5 rounded-2xl border border-border bg-card/60 p-1 text-xs font-medium"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={provider === "stripe"}
                  onClick={() => {
                    setProvider("stripe");
                    setGatewayError(null);
                    if (status === "error") setStatus("idle");
                  }}
                  disabled={isLoading}
                  className={`flex items-center justify-center gap-1.5 rounded-xl py-2 transition-all ${
                    provider === "stripe"
                      ? "bg-[color:var(--ochre)] text-black font-semibold shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <CreditCard className="h-3.5 w-3.5" />
                  Stripe
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={provider === "mercadopago"}
                  onClick={() => {
                    setProvider("mercadopago");
                    setGatewayError(null);
                    if (status === "error") setStatus("idle");
                  }}
                  disabled={isLoading}
                  className={`flex items-center justify-center gap-1.5 rounded-xl py-2 transition-all ${
                    provider === "mercadopago"
                      ? "bg-[color:var(--ochre)] text-black font-semibold shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <CreditCard className="h-3.5 w-3.5" />
                  MercadoPago
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={provider === "mock"}
                  onClick={() => {
                    setProvider("mock");
                    setGatewayError(null);
                    if (status === "error") setStatus("idle");
                  }}
                  disabled={isLoading}
                  className={`flex items-center justify-center gap-1.5 rounded-xl py-2 transition-all ${
                    provider === "mock"
                      ? "bg-[color:var(--ochre)] text-black font-semibold shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Crown className="h-3.5 w-3.5" />
                  Mock (Test)
                </button>
              </div>
            </div>

            <div className="mt-5">
              <CreditCard3D
                number={number}
                holder={holder}
                expiry={expiry}
                cvv={cvv}
                flipped={flipped}
              />
            </div>

            <form onSubmit={(e) => handlePaymentSubmit(e)} className="mt-6 grid gap-3">
              <Field label="Número de tarjeta" htmlFor="cc-number">
                <input
                  id="cc-number"
                  name="cardNumber"
                  type="text"
                  inputMode="numeric"
                  autoComplete="cc-number"
                  placeholder="1234 5678 9012 3456"
                  value={formatCardNumber(number)}
                  onChange={(e) => setNumber(digitsOnly(e.target.value, 16))}
                  disabled={inputsDisabled}
                  aria-invalid={status === "error"}
                  aria-describedby={status === "error" ? "gateway-connection-error" : undefined}
                  className="h-11 w-full rounded-xl border border-border bg-background px-4 font-mono text-sm tracking-wider focus:outline-none focus:ring-2 focus:ring-[color:var(--ochre)] disabled:opacity-60"
                />
              </Field>
              <Field label="Titular de la tarjeta" htmlFor="cc-name">
                <input
                  id="cc-name"
                  name="cardHolder"
                  type="text"
                  autoComplete="cc-name"
                  placeholder="NOMBRE APELLIDO"
                  value={holder}
                  onChange={(e) =>
                    setHolder(
                      e.target.value.replace(/[^a-zA-Z\u00C0-\u017F .'-]/g, "").slice(0, 26),
                    )
                  }
                  disabled={inputsDisabled}
                  aria-invalid={status === "error"}
                  aria-describedby={status === "error" ? "gateway-connection-error" : undefined}
                  className="h-11 w-full rounded-xl border border-border bg-background px-4 text-sm uppercase focus:outline-none focus:ring-2 focus:ring-[color:var(--ochre)] disabled:opacity-60"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="MM/YY" htmlFor="cc-exp">
                  <input
                    id="cc-exp"
                    name="cardExpiry"
                    type="text"
                    inputMode="numeric"
                    autoComplete="cc-exp"
                    placeholder="12/28"
                    value={expiry}
                    onChange={(e) => setExpiry(formatExpiry(e.target.value))}
                    disabled={inputsDisabled}
                    aria-invalid={status === "error"}
                    aria-describedby={status === "error" ? "gateway-connection-error" : undefined}
                    className="h-11 w-full rounded-xl border border-border bg-background px-4 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--ochre)] disabled:opacity-60"
                  />
                </Field>
                <Field label="CVV" htmlFor="cc-csc">
                  <input
                    id="cc-csc"
                    name="cardCvc"
                    type="text"
                    inputMode="numeric"
                    autoComplete="cc-csc"
                    placeholder="123"
                    value={cvv}
                    onChange={(e) => setCvv(digitsOnly(e.target.value, 4))}
                    onFocus={() => setFlipped(true)}
                    onBlur={() => setFlipped(false)}
                    disabled={inputsDisabled}
                    aria-invalid={status === "error"}
                    aria-describedby={status === "error" ? "gateway-connection-error" : undefined}
                    className="h-11 w-full rounded-xl border border-border bg-background px-4 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--ochre)] disabled:opacity-60"
                  />
                </Field>
              </div>

              {/* Error Banner section (R4 Branded Connection Error) */}
              {status === "error" && (
                <PaymentConnectionErrorAlert
                  errorDetails={gatewayError}
                  onRetry={() => handlePaymentSubmit(undefined, "connection_error")}
                  isRetrying={status === "loading-error"}
                />
              )}

              <div className="mt-4 grid gap-2">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-[color:var(--ochre)] text-sm font-semibold text-black shadow-sm transition hover:brightness-105 disabled:opacity-60"
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  {provider === "stripe"
                    ? "Pagar con Stripe"
                    : provider === "mercadopago"
                      ? "Pagar con MercadoPago"
                      : "Simular Pago Exitoso"}
                </button>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handlePaymentSubmit(undefined, "connection_error")}
                    disabled={isLoading}
                    className="flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-500/10 text-xs font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 disabled:opacity-60"
                  >
                    <WifiOff className="h-3.5 w-3.5" />
                    Prob. Conexión
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePaymentSubmit(undefined, "success")}
                    disabled={isLoading}
                    className="flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 text-xs font-medium text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-60"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Simular Éxito
                  </button>
                </div>
              </div>
            </form>

            <p className="mt-4 text-center text-[11px] leading-snug text-muted-foreground">
              Entorno de desarrollo y pruebas. No se realizará ningún cargo real.
            </p>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

function PaymentConnectionErrorAlert({
  errorDetails,
  onRetry,
  isRetrying = false,
}: {
  errorDetails?: PaymentGatewayError | null;
  onRetry: () => void;
  isRetrying?: boolean;
}) {
  const providerRaw = errorDetails?.provider || "pasarela";
  const providerLabel =
    providerRaw === "stripe"
      ? "Stripe"
      : providerRaw === "mercadopago"
        ? "MercadoPago"
        : "Pasarela de Pagos";

  const displayMsg =
    errorDetails?.message ||
    `No fue posible establecer una conexión segura con el servidor de ${providerLabel}. Por favor, verifica tu conexión a internet e inténtalo de nuevo.`;

  const errorCode = errorDetails?.code || "GATEWAY_CONNECTION_ERROR";

  return (
    <div
      id="gateway-connection-error"
      role="alert"
      aria-live="assertive"
      className="mt-3 rounded-2xl border border-amber-500/40 bg-gradient-to-br from-amber-500/15 via-amber-500/5 to-background p-4 shadow-sm backdrop-blur-sm"
    >
      <div className="flex items-start gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-amber-500/30 bg-amber-500/20 text-amber-600 dark:text-amber-400">
          <WifiOff className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <h3 className="font-display text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
              Error de Conexión
            </h3>
            <span className="rounded-full bg-amber-500/20 px-2 py-0.5 font-mono text-[10px] font-medium text-amber-800 dark:text-amber-200">
              {errorCode}
            </span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-foreground/85">{displayMsg}</p>
          <button
            type="button"
            onClick={onRetry}
            disabled={isRetrying}
            className="mt-3 flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/20 px-3 text-xs font-semibold text-amber-800 transition hover:bg-amber-500/30 active:scale-[0.98] dark:text-amber-200 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRetrying ? "animate-spin" : ""}`} />
            {isRetrying ? "Reintentando conexión..." : "Reintentar conexión con el proveedor"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SuccessScreen({ onGoToRecipes }: { onGoToRecipes: () => void }) {
  return (
    <div className="relative flex flex-col items-center py-6 text-center" aria-live="polite">
      <style>{SUCCESS_CSS}</style>
      <Confetti />
      <div className="relative grid h-20 w-20 place-items-center">
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-full bg-[color:var(--ochre)]/20 melik-halo"
        />
        <svg viewBox="0 0 52 52" className="relative h-20 w-20" aria-hidden="true">
          <circle
            cx="26"
            cy="26"
            r="24"
            fill="none"
            strokeWidth="3"
            className="melik-check-circle"
            stroke="#16a34a"
          />
          <path
            fill="none"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M14 27 L23 36 L39 18"
            className="melik-check-path"
            stroke="#16a34a"
          />
        </svg>
      </div>
      <h2 className="mt-5 font-display text-2xl font-semibold">
        ¡Pago exitoso! Bienvenido a Melik+
      </h2>
      <p className="mt-2 max-w-xs text-sm text-foreground/70">
        Kiko ilimitado, la Bóveda Melik y todas las ventajas premium ya están activas en tu cuenta.
      </p>
      <button
        type="button"
        onClick={onGoToRecipes}
        className="mt-6 h-11 w-full rounded-2xl bg-[color:var(--ochre)] text-sm font-semibold text-black shadow-sm hover:brightness-105"
      >
        Ir a mis recetas premium
      </button>
    </div>
  );
}

const CONFETTI_PIECES = Array.from({ length: 14 }, (_, i) => i);
const CONFETTI_COLORS = ["#D4AF37", "#16a34a", "#F5E6C8", "#B8860B", "#22c55e"];

function Confetti() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 -top-2 h-64 overflow-hidden melik-confetti-wrap"
    >
      {CONFETTI_PIECES.map((i) => {
        const left = (i * 7 + 3) % 100;
        const delay = (i % 5) * 0.08;
        const duration = 1.4 + (i % 4) * 0.15;
        const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
        const rotate = (i * 47) % 360;
        return (
          <span
            key={i}
            className="melik-confetti"
            style={{
              left: `${left}%`,
              backgroundColor: color,
              animationDelay: `${delay}s`,
              animationDuration: `${duration}s`,
              transform: `rotate(${rotate}deg)`,
            }}
          />
        );
      })}
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <label
        htmlFor={htmlFor}
        className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

// -------- formatters --------

function digitsOnly(v: string, max: number) {
  return v.replace(/\D/g, "").slice(0, max);
}

function formatCardNumber(raw: string) {
  const digits = raw.replace(/\D/g, "").slice(0, 16);
  return digits.replace(/(.{4})/g, "$1 ").trim();
}

function formatExpiry(raw: string) {
  const d = raw.replace(/\D/g, "").slice(0, 4);
  if (d.length <= 2) return d;
  return `${d.slice(0, 2)}/${d.slice(2)}`;
}

const SHAKE_CSS = `
@keyframes melik-shake {
  0%,100% { transform: translateX(0); }
  20% { transform: translateX(-6px); }
  40% { transform: translateX(6px); }
  60% { transform: translateX(-4px); }
  80% { transform: translateX(4px); }
}
.melik-shake { animation: melik-shake 0.45s cubic-bezier(.36,.07,.19,.97) both; }
`;

const SUCCESS_CSS = `
@keyframes melik-check-circle-in {
  from { stroke-dasharray: 0 166; }
  to { stroke-dasharray: 166 166; }
}
@keyframes melik-check-path-in {
  from { stroke-dasharray: 0 60; }
  to { stroke-dasharray: 60 60; }
}
@keyframes melik-halo-pulse {
  0% { transform: scale(0.6); opacity: 0; }
  60% { opacity: 1; }
  100% { transform: scale(1.35); opacity: 0; }
}
@keyframes melik-confetti-fall {
  0% { transform: translateY(-40px) rotate(0deg); opacity: 0; }
  15% { opacity: 1; }
  100% { transform: translateY(220px) rotate(540deg); opacity: 0; }
}
.melik-check-circle {
  stroke-dasharray: 0 166;
  animation: melik-check-circle-in 0.55s ease-out 0.05s forwards;
}
.melik-check-path {
  stroke-dasharray: 0 60;
  animation: melik-check-path-in 0.35s ease-out 0.55s forwards;
}
.melik-halo {
  animation: melik-halo-pulse 1.1s ease-out 0.2s both;
}
.melik-confetti {
  position: absolute;
  top: 0;
  width: 8px;
  height: 14px;
  border-radius: 2px;
  opacity: 0;
  animation-name: melik-confetti-fall;
  animation-timing-function: cubic-bezier(.2,.6,.4,1);
  animation-fill-mode: forwards;
  animation-iteration-count: 1;
}
@media (prefers-reduced-motion: reduce) {
  .melik-check-circle { animation: none; stroke-dasharray: 166 166; }
  .melik-check-path { animation: none; stroke-dasharray: 60 60; }
  .melik-halo { animation: none; opacity: 0; }
  .melik-confetti-wrap { display: none; }
}
`;

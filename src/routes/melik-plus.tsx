// Landing pública de la suscripción Melik+.
// - Toggle Mensual/Anual con precio dinámico.
// - CTA con guard de auth: invitados → /auth?redirect=/melik-plus.
// - Modal de checkout es sólo un cascarón (ver MelikPlusCheckoutModal).
// Sin Server Functions, sin pasarelas reales — este archivo es UI pura.
import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  CalendarCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  Crown,
  Lock,
  Percent,
  X,
} from "lucide-react";
import { useProfile } from "@/lib/use-profile";
import { showError } from "@/lib/errors/toast";
import {
  cancelMockSubscription,
  getMyBakeryEntitlements,
} from "@/lib/melik-plus.functions";
import {
  MelikPlusCheckoutModal,
  type Billing,
} from "@/components/MelikPlusCheckoutModal";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/melik-plus")({
  head: () => ({
    meta: [
      { title: "Melik+ — Suscripción Premium | Melik Recipes" },
      {
        name: "description",
        content:
          "Kiko ilimitado, privatiza tus recetas y gana una receta oficial de Melik Bakery cada 6 meses acumulados de suscripción.",
      },
      { property: "og:title", content: "Melik+ — Desbloquea el Chef que llevas dentro" },
      {
        property: "og:description",
        content:
          "Kiko ilimitado, privacidad total en tus recetas y una receta oficial permanente cada 6 meses de Melik+.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },

    ],
  }),
  component: MelikPlusPage,
});

const cop = new Intl.NumberFormat("es-CO");
const PRICES = {
  monthly: { amount: 15000, period: "mes", sub: null as string | null },
  yearly: { amount: 144000, period: "año", sub: `≈ $${cop.format(12000)} COP / mes` },
} as const;

const dateFmt = new Intl.DateTimeFormat("es-CO", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

function formatSubDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : dateFmt.format(d);
}

function isFuture(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return !isNaN(t) && t > Date.now();
}

function MelikPlusPage() {
  const { isAuthenticated, isPremium, profile } = useProfile();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [billing, setBilling] = useState<Billing>("monthly");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [retentionOpen, setRetentionOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const status = (profile?.subscription_status ?? "inactive") as
    | "active"
    | "canceled"
    | "inactive"
    | "past_due";
  const premiumUntil = profile?.premium_until ?? null;
  const untilFuture = isFuture(premiumUntil);
  const isActive = status === "active" && (premiumUntil === null || untilFuture);

  function handleCta() {
    if (isPremium) return;
    if (!isAuthenticated) {
      navigate({
        to: "/auth",
        search: { redirect: "/melik-plus" } as never,
      });
      return;
    }
    setCheckoutOpen(true);
  }

  async function handleConfirmCancel() {
    setBusy(true);
    try {
      const res = await cancelMockSubscription();
      await queryClient.invalidateQueries({ queryKey: ["profile"] });
      const fecha = formatSubDate(res.premium_until);
      toast.success(
        fecha
          ? `Suscripción cancelada. Conservas acceso hasta ${fecha}.`
          : "Suscripción cancelada.",
      );
      setRetentionOpen(false);
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative min-h-dvh overflow-hidden bg-background">
      {/* Halo dorado de fondo */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] opacity-70"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 0%, color-mix(in oklab, var(--ochre) 25%, transparent), transparent 70%)",
        }}
      />

      <div className="mx-auto max-w-5xl px-5 pt-10 pb-24 sm:pt-16">
        {/* Volver — sólo móvil, respeta el historial de navegación */}
        <button
          type="button"
          aria-label="Volver"
          onClick={() => {
            if (typeof window !== "undefined" && window.history.length > 1) {
              window.history.back();
            } else {
              void navigate({ to: "/" });
            }
          }}
          className="absolute left-4 top-4 z-10 grid h-10 w-10 place-items-center rounded-2xl border border-border bg-background/80 text-foreground backdrop-blur hover:bg-card md:hidden"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>

        <Hero />


        <div className="mt-10 flex justify-center">
          <BillingToggle billing={billing} onChange={setBilling} />
        </div>

        <div className="mt-8 grid gap-5 md:mt-10 md:grid-cols-2 md:gap-6">
          <FreePlanCard isPremium={isPremium} />
          <PlusPlanCard
            billing={billing}
            isPremium={isPremium}
            isAuthenticated={isAuthenticated}
            onCta={handleCta}
            onCancelClick={isActive ? () => setRetentionOpen(true) : undefined}
          />
        </div>

        <BakeryUnlockCallout />

        <div className="mt-10 flex justify-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-[color:var(--ochre)]/30 bg-[color:var(--ochre)]/10 px-4 py-2.5 text-sm font-semibold text-[color:var(--ochre)] shadow-sm">
            <CalendarCheck className="h-4 w-4" />
            Cancela cuando quieras
          </span>
        </div>

      </div>

      <MelikPlusCheckoutModal
        open={checkoutOpen && isAuthenticated && !isPremium}
        onClose={() => setCheckoutOpen(false)}
        billing={billing}
      />

      <AlertDialog open={retentionOpen} onOpenChange={(o) => !busy && setRetentionOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Estás seguro de que quieres perder a Kiko ilimitado y el catálogo oficial?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {premiumUntil
                ? `Conservarás acceso a Melik+ hasta el ${formatSubDate(premiumUntil)}. Después, tu cuenta volverá al plan Gratuito.`
                : "Tu cuenta volverá al plan Gratuito al confirmar."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Mantener Melik+</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleConfirmCancel();
              }}
              disabled={busy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {busy ? "Cancelando…" : "Sí, cancelar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Hero() {
  return (
    <header className="text-center">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--ochre)]/40 bg-[color:var(--ochre)]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-[color:var(--ochre)]">
        <Crown className="h-3.5 w-3.5" /> Melik+
      </span>
      <h1 className="mt-4 font-display text-4xl font-semibold leading-tight sm:text-5xl">
        Desbloquea el Chef que llevas dentro
      </h1>
      <p className="mx-auto mt-4 max-w-xl text-balance text-sm text-muted-foreground sm:text-base">
        Lleva tu cocina al siguiente nivel con Kiko sin límites, acceso a las Recetas Oficiales de Melik Bakery y funciones exclusivas para tener control total.&nbsp;
      </p>
    </header>
  );
}

const TOTAL_YEARS = 10;

function clampYear(y: number) {
  return Math.max(1, Math.min(TOTAL_YEARS, y));
}

function BakeryUnlockCallout() {
  const { isAuthenticated, userId } = useProfile();
  // Cache scoped por usuario: evita fugas visuales entre cuentas al hacer
  // logout/login (backend ya scoping por auth.uid()).
  const { data: entitlements } = useQuery({
    queryKey: ["bakery-entitlements", userId ?? "guest"],
    queryFn: () => getMyBakeryEntitlements(),
    enabled: isAuthenticated,
    staleTime: 60 * 1000,
  });

  const paidMonthsTotal = entitlements?.paidMonthsTotal ?? 0;
  const unlocksClaimed = entitlements?.unlocksClaimed ?? 0;

  // Año actual del usuario según su progreso real (1..10).
  const derivedYear = useMemo(
    () => clampYear(Math.floor(Math.max(paidMonthsTotal - 1, 0) / 12) + 1),
    [paidMonthsTotal],
  );

  // Nota de seguridad: esta sección es puramente informativa. El canje real
  // sucede en /melik-bakery vía claimBakeryUnlock (server-side, RLS por user).
  const [year, setYear] = useState<number>(() => derivedYear);

  // Detección one-shot del hito recién reclamado: solo animamos el índice que
  // acaba de cruzar de no-claimed → claimed en esta sesión.
  const prevClaimedRef = useRef<number | null>(null);
  const [justClaimedIndex, setJustClaimedIndex] = useState<number | null>(null);
  useEffect(() => {
    if (prevClaimedRef.current === null) {
      prevClaimedRef.current = unlocksClaimed;
      return;
    }
    if (unlocksClaimed > prevClaimedRef.current) {
      setJustClaimedIndex(unlocksClaimed - 1);
      const t = window.setTimeout(() => setJustClaimedIndex(null), 700);
      prevClaimedRef.current = unlocksClaimed;
      return () => window.clearTimeout(t);
    }
    prevClaimedRef.current = unlocksClaimed;
  }, [unlocksClaimed]);

  // Reduce motion.
  const prefersReducedMotion = useMemo(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  }, []);

  // Drag horizontal (pointer events, cubre mouse + touch + pen).
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [dragDx, setDragDx] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStateRef = useRef({
    pointerId: null as number | null,
    startX: 0,
    startY: 0,
    active: false,
    didDrag: false,
    suppressClick: false,
  });

  function beginPointer(e: React.PointerEvent<HTMLDivElement>) {
    // Solo botón primario (o touch).
    if (e.pointerType === "mouse" && e.button !== 0) return;
    dragStateRef.current.pointerId = e.pointerId;
    dragStateRef.current.startX = e.clientX;
    dragStateRef.current.startY = e.clientY;
    dragStateRef.current.active = false;
    dragStateRef.current.didDrag = false;
  }

  function movePointer(e: React.PointerEvent<HTMLDivElement>) {
    const st = dragStateRef.current;
    if (st.pointerId !== e.pointerId) return;
    const dx = e.clientX - st.startX;
    const dy = e.clientY - st.startY;

    if (!st.active) {
      // Solo secuestramos el gesto si es claramente horizontal. Así no
      // bloqueamos el scroll vertical de la página en móvil.
      if (Math.abs(dx) < 8 || Math.abs(dx) <= Math.abs(dy)) return;
      st.active = true;
      st.didDrag = true;
      setIsDragging(true);
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        /* noop */
      }
    }

    // Resistencia en los topes (Año 1 y Año 10).
    let effectiveDx = dx;
    if ((year === 1 && dx > 0) || (year === TOTAL_YEARS && dx < 0)) {
      effectiveDx = dx * 0.35;
    }
    setDragDx(effectiveDx);
  }

  function endPointer(e: React.PointerEvent<HTMLDivElement>) {
    const st = dragStateRef.current;
    if (st.pointerId !== e.pointerId) return;
    const wasActive = st.active;
    const viewport = viewportRef.current;
    const width = viewport?.clientWidth ?? 0;
    const dx = dragDx;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
    if (wasActive) {
      const threshold = Math.max(60, width * 0.25);
      if (dx <= -threshold) setYear((y) => clampYear(y + 1));
      else if (dx >= threshold) setYear((y) => clampYear(y - 1));
      st.suppressClick = true;
      window.setTimeout(() => (st.suppressClick = false), 0);
    }
    dragStateRef.current.pointerId = null;
    dragStateRef.current.active = false;
    setIsDragging(false);
    setDragDx(0);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setYear((y) => clampYear(y - 1));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      setYear((y) => clampYear(y + 1));
    } else if (e.key === "Home") {
      e.preventDefault();
      setYear(1);
    } else if (e.key === "End") {
      e.preventDefault();
      setYear(TOTAL_YEARS);
    }
  }

  const trackTransform = `translate3d(calc(${-(year - 1) * 100}% + ${dragDx}px), 0, 0)`;

  const claimedInYear = (() => {
    let c = 0;
    const base = (year - 1) * 2;
    if (unlocksClaimed > base) c++;
    if (unlocksClaimed > base + 1) c++;
    return c;
  })();

  return (
    <section className="mt-10 rounded-3xl border border-[color:var(--ochre)]/30 bg-gradient-to-br from-[color:var(--ochre)]/10 to-transparent p-6 sm:p-8">
      <div className="flex items-center gap-2">
        <Crown className="h-4 w-4 text-[color:var(--ochre)]" />
        <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--ochre)]">
          Beneficios Melik Bakery
        </p>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {/* Beneficio 1: Descuento */}
        <div className="rounded-2xl border border-[color:var(--ochre)]/25 bg-card/40 p-5">
          <div className="flex items-center gap-2 text-[color:var(--ochre)]">
            <Percent className="h-4 w-4" />
            <span className="text-[11px] font-semibold uppercase tracking-wider">
              Descuento permanente
            </span>
          </div>
          <h3 className="mt-2 font-display text-xl font-semibold sm:text-2xl">
            5% en todas tus compras
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Aplicado automáticamente en cada pedido a través de la web de Melik
            Bakery mientras tu suscripción esté activa.
          </p>
        </div>

        {/* Beneficio 2: Recetas oficiales */}
        <div className="rounded-2xl border border-[color:var(--ochre)]/25 bg-card/40 p-5">
          <div className="flex items-center gap-2 text-[color:var(--ochre)]">
            <Crown className="h-4 w-4" />
            <span className="text-[11px] font-semibold uppercase tracking-wider">
              Recetas oficiales
            </span>
          </div>
          <h3 className="mt-2 font-display text-xl font-semibold sm:text-2xl">
            Cada 6 meses, una receta es TUYA
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            En los meses <strong>1, 7, …</strong> ganas un desbloqueo
            permanente. No pagas por receta: cada mes de suscripción suma al
            contador (no tiene que ser continuo).
          </p>
        </div>
      </div>

      {/* Selector de año */}
      <div className="mt-6 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => setYear((y) => clampYear(y - 1))}
          disabled={year === 1}
          aria-label="Año anterior"
          className="grid h-9 w-9 place-items-center rounded-full border border-border bg-card text-foreground/80 transition-all hover:border-[color:var(--ochre)]/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div
          className="min-w-[6.5rem] text-center font-display text-lg font-semibold tabular-nums"
          aria-live="polite"
        >
          Año {year}
        </div>
        <button
          type="button"
          onClick={() => setYear((y) => clampYear(y + 1))}
          disabled={year === TOTAL_YEARS}
          aria-label="Año siguiente"
          className="grid h-9 w-9 place-items-center rounded-full border border-border bg-card text-foreground/80 transition-all hover:border-[color:var(--ochre)]/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-1.5 flex items-center justify-center gap-2 text-[11px] text-muted-foreground">
        <span>
          Año {year} de {TOTAL_YEARS} · {claimedInYear}/2 reclamadas
        </span>
        {isAuthenticated && year !== derivedYear && (
          <>
            <span aria-hidden>·</span>
            <button
              type="button"
              onClick={() => setYear(derivedYear)}
              className="text-[color:var(--ochre)] underline-offset-2 hover:underline"
            >
              Ir a Año {derivedYear}
            </button>
          </>
        )}
      </div>

      {/* Carrusel */}
      <div
        ref={viewportRef}
        role="group"
        aria-label="Progreso Melik Bakery por año"
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={beginPointer}
        onPointerMove={movePointer}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onClickCapture={(e) => {
          if (dragStateRef.current.suppressClick) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
        className="mt-5 overflow-hidden select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ochre)]/40 rounded-2xl"
        style={{
          touchAction: "pan-y",
          cursor: isDragging ? "grabbing" : "grab",
          WebkitMaskImage:
            "linear-gradient(90deg, transparent 0, black 10%, black 90%, transparent 100%)",
          maskImage:
            "linear-gradient(90deg, transparent 0, black 10%, black 90%, transparent 100%)",
        }}
      >
        <div
          className="flex"
          style={{
            transform: trackTransform,
            transition:
              isDragging || prefersReducedMotion
                ? "none"
                : "transform 380ms cubic-bezier(0.22, 1, 0.36, 1)",
            willChange: "transform",
          }}
        >
          {Array.from({ length: TOTAL_YEARS }, (_, i) => {
            const y = i + 1;
            const yearMilestones = [
              { month: 1, absoluteMonth: (y - 1) * 12 + 1, unlockIndex: (y - 1) * 2 },
              { month: 7, absoluteMonth: (y - 1) * 12 + 7, unlockIndex: (y - 1) * 2 + 1 },
            ];
            return (
              <div
                key={y}
                className="flex w-full shrink-0 items-center justify-center gap-3 px-4"
                aria-hidden={y !== year}
              >
                {yearMilestones.map((m) => {
                  const reached = paidMonthsTotal >= m.absoluteMonth;
                  const claimed = unlocksClaimed > m.unlockIndex;
                  const isClaimed = reached && claimed;
                  const shouldAnimate =
                    !prefersReducedMotion && justClaimedIndex === m.unlockIndex;
                  return (
                    <span
                      key={m.unlockIndex}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground"
                      aria-label={`Mes ${m.month} de Año ${y}${isClaimed ? " · reclamada" : ""}`}
                    >
                      <span
                        className={`grid h-5 w-5 place-items-center rounded-full text-[10px] font-bold transition-colors duration-300 ${
                          isClaimed
                            ? `bg-emerald-500 text-white ${shouldAnimate ? "animate-milestone-claim" : ""}`
                            : "bg-[color:var(--ochre)]/20 text-[color:var(--ochre)]"
                        }`}
                      >
                        {isClaimed ? <Check className="h-3 w-3" /> : (m.unlockIndex % 2) + 1}
                      </span>
                      Mes {m.month}
                    </span>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}



function BillingToggle({
  billing,
  onChange,
}: {
  billing: Billing;
  onChange: (b: Billing) => void;
}) {
  const isYearly = billing === "yearly";
  return (
    <div
      role="tablist"
      aria-label="Frecuencia de facturación"
      className="relative inline-flex items-center gap-1 rounded-full border border-border bg-card p-1"
    >
      <span
        aria-hidden
        className="absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-background shadow-sm transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
        style={{ transform: isYearly ? "translateX(100%)" : "translateX(0)" }}
      />
      <button
        type="button"
        role="tab"
        aria-selected={!isYearly}
        aria-pressed={!isYearly}
        onClick={() => onChange("monthly")}
        className={`relative z-10 flex min-w-[9rem] items-center justify-center rounded-full px-5 py-1.5 text-sm font-medium transition-colors ${
          !isYearly ? "text-foreground" : "text-muted-foreground"
        }`}
      >
        Mensual
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={isYearly}
        aria-pressed={isYearly}
        onClick={() => onChange("yearly")}
        className={`relative z-10 flex min-w-[9rem] items-center justify-center gap-2 rounded-full px-5 py-1.5 text-sm font-medium transition-colors ${
          isYearly ? "text-foreground" : "text-muted-foreground"
        }`}
      >
        Anual
        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
          Ahorra 20%
        </span>
      </button>
    </div>
  );
}

function FreePlanCard({ isPremium }: { isPremium: boolean }) {
  return (
    <article className="flex flex-col rounded-3xl border border-border bg-card/40 p-6 sm:p-7">
      <header>
        <h2 className="font-display text-xl font-semibold">Plan Gratis</h2>
        <p className="mt-1 text-xs text-muted-foreground">Para explorar Melik Recipes.</p>
      </header>
      <div className="mt-5 flex items-baseline gap-1.5">
        <span className="font-display text-4xl font-semibold">$0</span>
        <span className="text-sm text-muted-foreground">COP</span>
      </div>

      <p className="mt-6 text-xs font-medium text-muted-foreground">
        Precios en pesos colombianos (COP).
      </p>
      <ul className="mt-3 grid gap-3 text-sm">
        <FeatureCheck>Kiko con límite diario</FeatureCheck>
        <FeatureCheck>Acceso a recetas de la Comunidad</FeatureCheck>
        <FeatureCheck>Tu recetario personal ilimitado</FeatureCheck>
        <FeatureCross>Sin desbloqueos de Melik Bakery</FeatureCross>
        <FeatureCross>Sin privatizar tus recetas</FeatureCross>

      </ul>

      <div className="mt-auto pt-6">
        <button
          type="button"
          disabled
          className="h-11 w-full cursor-not-allowed rounded-2xl border border-border bg-background text-sm font-medium text-muted-foreground opacity-70"
        >
          {isPremium ? "Plan gratuito" : "Tu plan actual"}
        </button>
      </div>
    </article>
  );
}

function PlusPlanCard({
  billing,
  isPremium,
  isAuthenticated,
  onCta,
  onCancelClick,
}: {
  billing: Billing;
  isPremium: boolean;
  isAuthenticated: boolean;
  onCta: () => void;
  onCancelClick?: () => void;
}) {
  const price = PRICES[billing];
  const ctaLabel = isPremium
    ? "Ya eres Melik+"
    : !isAuthenticated
    ? "Comenzar ahora"
    : "Comenzar ahora";

  return (
    <article
      className="relative flex flex-col rounded-3xl border-2 border-[color:var(--ochre)] bg-card/60 p-6 sm:p-7"
      style={{
        boxShadow:
          "0 20px 50px -20px color-mix(in oklab, var(--ochre) 45%, transparent)",
      }}
    >
      <span className="absolute -top-3 left-6 inline-flex items-center gap-1 rounded-full bg-[color:var(--ochre)] px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-background">
        <Crown className="h-3 w-3" /> Recomendado
      </span>

      <header>
        <h2 className="font-display text-xl font-semibold">Melik+</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Aprovecha Melik Recipes al máximo, sin límites.
        </p>
      </header>

      <div className="mt-5 flex items-baseline gap-1.5">
        <span className="font-display text-4xl font-semibold">
          ${cop.format(price.amount)}
        </span>
        <span className="text-sm text-muted-foreground">COP / {price.period}</span>
      </div>
      {price.sub && (
        <p className="mt-1 text-xs font-medium text-[color:var(--ochre)]">
          {price.sub}
        </p>
      )}

      <p className="mt-6 text-xs font-medium text-muted-foreground">
        Precios en pesos colombianos (COP).
      </p>
      <ul className="mt-3 grid gap-3 text-sm">
        <FeatureCheck highlighted>Kiko Asistente ilimitado</FeatureCheck>
        <FeatureCheck highlighted>Desbloqueos de Melik Bakery (1 cada 6 meses)</FeatureCheck>
        <FeatureCheck highlighted>5% de descuento en todas las compras que hagas</FeatureCheck>
        <FeatureCheck highlighted>Privatiza tus recetas</FeatureCheck>
        <FeatureCheck highlighted>Cero publicidad</FeatureCheck>
        <FeatureCheck highlighted>Soporte prioritario</FeatureCheck>
      </ul>

      <div className="mt-auto pt-6">
        <button
          type="button"
          onClick={onCta}
          disabled={isPremium}
          className={`flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-sm font-semibold transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ochre)] focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
            isPremium
              ? "cursor-not-allowed bg-[color:var(--ochre)]/40 text-background/80"
              : "bg-[color:var(--ochre)] text-background hover:brightness-105 active:scale-[0.98]"
          }`}
        >
          {isPremium ? <Lock className="h-4 w-4" /> : <Crown className="h-4 w-4" />}
          {ctaLabel}
        </button>
        {isPremium && onCancelClick && (
          <button
            type="button"
            onClick={onCancelClick}
            className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-2xl border border-border bg-transparent text-sm font-medium text-muted-foreground transition-colors hover:border-[color:var(--ochre)]/40 hover:bg-card hover:text-foreground/85 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ochre)] focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Cancelar suscripción
          </button>
        )}
        {!isAuthenticated && !isPremium && (
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            Necesitas una cuenta para suscribirte.
          </p>
        )}
      </div>
    </article>
  );
}

function FeatureCheck({
  children,
  highlighted = false,
}: {
  children: React.ReactNode;
  highlighted?: boolean;
}) {
  return (
    <li className="flex items-start gap-2.5">
      <Check
        className={`mt-0.5 h-4 w-4 shrink-0 ${
          highlighted ? "text-[color:var(--ochre)]" : "text-emerald-600 dark:text-emerald-400"
        }`}
      />
      <span className="text-foreground/85">{children}</span>
    </li>
  );
}

function FeatureCross({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-muted-foreground">
      <X className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </li>
  );
}

import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { errorText, showError } from "@/lib/errors/toast";
import {
  Crown,
  Download,
  KeyRound,
  LogOut,
  Shield,
  Trash2,
  Upload,
  X,
  CreditCard,
} from "lucide-react";
import { useIsAdmin } from "@/lib/use-admin";
import { changePassword } from "@/lib/auth/auth.functions";
import { clearSession, getSession, useSessionUser } from "@/lib/auth/session-store";
import { useModalA11y } from "@/hooks/use-modal-a11y";
import { useRecipes } from "@/lib/recipes-context";
import { deleteAccount, importRecipes } from "@/lib/recipes.functions";
import { toggleDevPremium } from "@/lib/official-recipes.functions";
import { cancelMockSubscription, getMyBakeryEntitlements } from "@/lib/melik-plus.functions";
import { useProfile } from "@/lib/use-profile";
import { downloadRecipesCsv } from "@/lib/export-csv";
import { parseRecipesCsv } from "@/lib/import-csv";
import { PasswordChecklist, isPasswordStrong } from "@/components/PasswordChecklist";
import { AvatarEditor } from "@/components/AvatarEditor";
import { UsernameField, type UsernameStatus } from "@/components/UsernameField";
import { claimUsername } from "@/lib/username.functions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "Mi perfil — Melik Recipes" },
      {
        name: "description",
        content: "Gestiona tu cuenta, tus preferencias y tu privacidad en Melik Recipes.",
      },
      { property: "og:title", content: "Mi perfil — Melik Recipes" },
      { property: "og:url", content: "https://melik-recipes.lovable.app/profile" },
      { name: "robots", content: "noindex" },
    ],
    links: [{ rel: "canonical", href: "https://melik-recipes.lovable.app/profile" }],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { recipes } = useRecipes();

  const { profile } = useProfile();

  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    setEmail(getSession()?.email ?? null);
  }, []);

  const [pwOpen, setPwOpen] = useState(false);

  const initials = (() => {
    const f = (profile?.first_name ?? "").trim();
    const l = (profile?.last_name ?? "").trim();
    if (f && l) return (f[0] + l[0]).toUpperCase();
    if (f) return f.slice(0, 2).toUpperCase();
    return "ME";
  })();

  const fullName =
    [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "Mi cuenta";

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    clearSession();
    await router.invalidate();
    navigate({ to: "/", replace: true });
  }

  async function handleDelete() {
    try {
      await deleteAccount();
    } catch (e) {
      showError(e);
      return;
    }
    await queryClient.cancelQueries();
    queryClient.clear();
    // The account row is already gone server-side (cascades to every table),
    // so no server round-trip is needed to invalidate sessions — just drop
    // the local token.
    clearSession();
    try {
      const keys = Object.keys(localStorage);
      for (const k of keys) {
        if (k === "meliks.recipes.guest.v1" || k === "meliks.recipes.v1") {
          localStorage.removeItem(k);
        }
      }
      sessionStorage.clear();
    } catch {
      /* ignore */
    }
    toast.success("Cuenta eliminada");
    await router.invalidate();
    navigate({ to: "/", replace: true });
  }

  function handleExport() {
    if (recipes.length === 0) {
      toast.info("No tienes recetas para exportar todavía");
      return;
    }
    downloadRecipesCsv(recipes);
    toast.success("Descargando tu respaldo CSV");
  }

  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [importing, setImporting] = useState(false);

  function triggerImport() {
    importInputRef.current?.click();
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset the input immediately so the same file can be picked again later.
    e.target.value = "";
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      showError(new Error("APP-FILE-002: csv >2MB"));
      return;
    }
    setImporting(true);
    try {
      const text = await file.text();
      const parsed = parseRecipesCsv(text);
      if (parsed.length === 0) {
        toast.info("No se encontraron recetas en el archivo");
        return;
      }
      if (parsed.length > 500) {
        toast.error("Máximo 500 recetas por importación", {
          description: "Divide tu archivo en partes más pequeñas.",
        });
        return;
      }
      const result = await importRecipes({ data: { recipes: parsed } });
      await queryClient.invalidateQueries({ queryKey: ["recipes"] });
      const parts: string[] = [];
      parts.push(`${result.inserted} importadas`);
      if (result.skipped > 0) parts.push(`${result.skipped} omitidas (duplicadas)`);
      toast.success(parts.join(" · "));
    } catch (err) {
      showError(err);
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 md:py-12">
      <header className="flex items-center gap-5">
        {profile?.id ? (
          <AvatarEditor
            userId={profile.id}
            avatarUrl={profile.avatar_url ?? null}
            initials={initials}
          />
        ) : (
          <div className="grid h-20 w-20 place-items-center overflow-hidden rounded-3xl bg-primary text-2xl font-semibold text-primary-foreground">
            {initials}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium uppercase tracking-wider text-[color:var(--ochre)]">
            Mi perfil
          </p>
          <div className="flex flex-col gap-1 md:flex-row md:items-baseline md:gap-3">
            <h1 className="truncate font-display text-3xl font-semibold">{fullName}</h1>
            {profile?.username && (
              <span className="truncate font-display text-xl font-medium text-muted-foreground">
                @{profile.username}
              </span>
            )}
          </div>
          {email && <p className="truncate text-sm text-muted-foreground">{email}</p>}
        </div>
      </header>

      {profile && profile.username === null && <ClaimUsernameSection />}

      <section className="mt-8 grid gap-4 sm:grid-cols-2">
        <div className="rounded-3xl border border-border/60 bg-card p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Recetas guardadas
          </p>
          <p className="mt-2 font-display text-4xl font-semibold">{recipes.length}</p>
        </div>
        <div className="rounded-3xl border border-border/60 bg-card p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Respaldo
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Exporta o restaura tus recetas usando un archivo CSV.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={handleExport}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Download className="h-4 w-4" /> Exportar (CSV)
            </button>
            <button
              onClick={triggerImport}
              disabled={importing}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-medium hover:bg-card disabled:opacity-60"
            >
              <Upload className="h-4 w-4" /> {importing ? "Importando…" : "Importar (CSV)"}
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept=".csv,text/csv"
              hidden
              onChange={handleImportFile}
            />
          </div>
        </div>
      </section>

      <SubscriptionSection />
      <AdminSection />
      <PremiumDevSection isPremium={!!profile?.is_premium} />

      <section className="mt-8 grid gap-3">
        <button
          onClick={() => setPwOpen(true)}
          className="flex items-center justify-between rounded-2xl border border-border bg-card px-5 py-4 text-left text-sm font-medium hover:bg-card/70"
        >
          <span className="inline-flex items-center gap-2">
            <KeyRound className="h-4 w-4" /> Cambiar contraseña
          </span>
          <span className="text-muted-foreground">›</span>
        </button>

        <button
          onClick={handleSignOut}
          className="flex items-center justify-between rounded-2xl border border-border bg-card px-5 py-4 text-left text-sm font-medium hover:bg-card/70"
        >
          <span className="inline-flex items-center gap-2">
            <LogOut className="h-4 w-4" /> Cerrar sesión
          </span>
          <span className="text-muted-foreground">›</span>
        </button>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button className="flex items-center justify-between rounded-2xl border border-destructive/30 bg-destructive/5 px-5 py-4 text-left text-sm font-medium text-destructive hover:bg-destructive/10">
              <span className="inline-flex items-center gap-2">
                <Trash2 className="h-4 w-4" /> Eliminar cuenta
              </span>
              <span>›</span>
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar tu cuenta permanentemente?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta acción es <strong>irreversible</strong>. Se borrarán tu perfil, todas tus
                recetas y tu sesión. No podremos recuperar ningún dato después.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Sí, eliminar todo
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </section>

      {pwOpen && <ChangePasswordModal onClose={() => setPwOpen(false)} />}
    </div>
  );
}

// Developer-only tools — restringido a cuentas con rol `dev`.
// Los admin lo asignan desde /admin/usuarios y NO tienen acceso al panel /admin
// desde este rol: `dev` es exclusivamente para pruebas internas de producto.
function PremiumDevSection({ isPremium }: { isPremium: boolean }) {
  const { isDev, isLoading } = useIsAdmin();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<null | string>(null);
  if (isLoading || !isDev) return null;

  const run = async (label: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(label);
    try {
      await fn();
      await queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast.success(ok);
    } catch (e) {
      showError(e);
    } finally {
      setBusy(null);
    }
  };

  const onToggle = () =>
    run("toggle", () => toggleDevPremium(), isPremium ? "Melik+ desactivado" : "Melik+ activado");

  const onTrial = (days: number | null) =>
    run(
      `trial-${days ?? "revoke"}`,
      async () => {
        const { grantSelfDevTrial } = await import("@/lib/official-recipes.functions");
        return grantSelfDevTrial({ data: { days } });
      },
      days ? `Trial +${days} días` : "Trial revocado",
    );

  return (
    <section className="mt-8 overflow-hidden rounded-2xl border border-dashed border-blue-500/40 bg-blue-500/5">
      <div className="flex items-center justify-between gap-2 border-b border-blue-500/20 bg-blue-500/10 px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest text-blue-300">
        <span>Internal · Dev tools</span>
        <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-blue-200">no admin</span>
      </div>
      <div className="space-y-4 px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-blue-300">
              <Crown className="h-3.5 w-3.5" /> Melik+ indefinido
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Bypass permanente del muro de pago. Estado:{" "}
              <strong className={isPremium ? "text-blue-300" : "text-foreground"}>
                {isPremium ? "Activo" : "Inactivo"}
              </strong>
            </p>
          </div>
          <button
            type="button"
            disabled={!!busy}
            onClick={onToggle}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-500 px-4 text-sm font-medium text-white hover:bg-blue-500/90 disabled:opacity-60"
          >
            {isPremium ? "Desactivar" : "Activar"}
          </button>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-300">
            Prueba gratis (trial)
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Extiende <code>premium_until</code> desde hoy. Independiente del toggle indefinido.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {[3, 7, 30].map((d) => (
              <button
                key={d}
                type="button"
                disabled={!!busy}
                onClick={() => onTrial(d)}
                className="rounded-xl bg-blue-500/10 px-3 py-2 text-xs font-medium text-blue-200 transition-colors hover:bg-blue-500/20 disabled:opacity-50"
              >
                +{d} días
              </button>
            ))}
            <button
              type="button"
              disabled={!!busy}
              onClick={() => onTrial(null)}
              className="rounded-xl bg-zinc-500/10 px-3 py-2 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-500/20 disabled:opacity-50"
            >
              Revocar
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

// Bloque de reclamación de @username para cuentas viejas (username == null).
function ClaimUsernameSection() {
  const queryClient = useQueryClient();
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<UsernameStatus>("idle");
  const [busy, setBusy] = useState(false);

  const canSubmit = status === "available" && !busy;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    try {
      await claimUsername({ data: { username: value } });
      await queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast.success("¡Nombre de usuario reservado!");
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-8 rounded-3xl border border-primary/40 bg-primary/5 p-5">
      <p className="font-display text-base font-semibold text-foreground">
        ✨ Agrega tu nombre de usuario para activar las funciones sociales de Melik
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        ⚠️ Elígelo con cuidado: será tu identidad única y <strong>no podrá modificarse</strong>{" "}
        después.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-start">
        <UsernameField value={value} onChange={setValue} onStatusChange={setStatus} />
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="h-11 rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {busy ? "Guardando…" : "Confirmar"}
        </button>
      </div>
    </section>
  );
}

// ============================================================
// Suscripción y Facturación (mock de pagos — sin pasarela real)
// ============================================================
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

// Derivación pura del estado de suscripción a mostrar. Precedencia clave:
// `is_premium` (acceso efectivo) manda sobre `subscription_status` (ciclo de
// pago), para no mostrar "Gratuito" a usuarios con acceso indefinido otorgado
// por admin/dev cuyo status quedó como "canceled" tras un ciclo previo.
type SubState =
  | { kind: "indefinite" }
  | { kind: "active"; until: string | null }
  | { kind: "canceled_with_access"; until: string }
  | { kind: "trial"; until: string }
  | { kind: "free" };

function deriveSubscriptionState(
  profile:
    | {
        is_premium?: boolean | null;
        premium_until?: string | null;
        subscription_status?: string | null;
      }
    | null
    | undefined,
): SubState {
  if (!profile) return { kind: "free" };
  const isPremium = profile.is_premium === true;
  const until = profile.premium_until ?? null;
  const untilFuture = isFuture(until);
  const status = profile.subscription_status ?? "inactive";

  // 1. Acceso indefinido: premium efectivo sin fecha futura válida.
  if (isPremium && !untilFuture) return { kind: "indefinite" };
  // 2. Activo con renovación: premium + fecha futura + ciclo activo.
  if (isPremium && untilFuture && status === "active") {
    return { kind: "active", until };
  }
  // 3. Cancelado con acceso remanente.
  if (status === "canceled" && untilFuture) {
    return { kind: "canceled_with_access", until: until! };
  }
  // 4. Prueba activa (trial): sin premium permanente pero con fecha futura.
  if (!isPremium && untilFuture) return { kind: "trial", until: until! };
  // 5. Free (o expirado sin premium).
  return { kind: "free" };
}

function SubscriptionSection() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile } = useProfile();
  const [retentionOpen, setRetentionOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Gate defensivo cross-user: si el auth id vivo no coincide con el profile
  // cargado, mostramos skeleton en lugar de datos ajenos (evita flash tras
  // cambio de sesión en misma pestaña, antes de que las queries se purguen).
  const { userId } = useSessionUser();
  const profileReady = !!profile && (!userId || profile.id === userId);

  const sub = deriveSubscriptionState(profileReady ? profile : null);

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
    <section className="mt-8 rounded-3xl border border-border/60 bg-card p-5">
      <div className="flex items-center gap-2">
        <CreditCard className="h-4 w-4 text-[color:var(--ochre)]" />
        <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--ochre)]">
          Suscripción y facturación
        </p>
      </div>

      {!profileReady && (
        <div className="mt-3 space-y-2">
          <div className="h-6 w-56 animate-pulse rounded-md bg-muted" />
          <div className="h-4 w-40 animate-pulse rounded-md bg-muted/70" />
        </div>
      )}

      {profileReady && sub.kind === "indefinite" && (
        <div className="mt-3">
          <p className="font-display text-xl font-semibold">
            Plan Actual:{" "}
            <span className="inline-flex items-center gap-1.5 text-[color:var(--ochre)]">
              <Crown className="h-4 w-4" /> Melik+ (Acceso indefinido)
            </span>
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Tu acceso a Melik+ no expira. Disfruta todos los beneficios sin cobros recurrentes.
          </p>
        </div>
      )}

      {profileReady && sub.kind === "active" && (
        <div className="mt-3">
          <p className="font-display text-xl font-semibold">
            Plan Actual:{" "}
            <span className="inline-flex items-center gap-1.5 text-[color:var(--ochre)]">
              <Crown className="h-4 w-4" /> Melik+ (Activo)
            </span>
          </p>
          {sub.until && (
            <p className="mt-1 text-sm text-muted-foreground">
              Próximo cobro: <strong className="text-foreground">{formatSubDate(sub.until)}</strong>
            </p>
          )}
          <button
            type="button"
            onClick={() => setRetentionOpen(true)}
            className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl border border-destructive/30 bg-transparent px-4 text-sm font-medium text-destructive hover:bg-destructive/10"
          >
            Cancelar suscripción
          </button>
        </div>
      )}

      {profileReady && sub.kind === "canceled_with_access" && (
        <div className="mt-3">
          <p className="font-display text-xl font-semibold text-muted-foreground">
            Plan Actual:{" "}
            <span className="inline-flex items-center gap-1.5 text-foreground">
              <Crown className="h-4 w-4 text-[color:var(--ochre)]" />
              Melik+ (Cancela el {formatSubDate(sub.until)})
            </span>
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Mantienes acceso hasta esa fecha. Después, tu cuenta volverá al plan Gratuito.
          </p>
        </div>
      )}

      {profileReady && sub.kind === "trial" && (
        <div className="mt-3">
          <p className="font-display text-xl font-semibold">
            Plan Actual:{" "}
            <span className="inline-flex items-center gap-1.5 text-[color:var(--ochre)]">
              <Crown className="h-4 w-4" /> Melik+ (Prueba hasta {formatSubDate(sub.until)})
            </span>
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Estás disfrutando Melik+ de prueba. Suscríbete para conservar el acceso al terminar.
          </p>
          <button
            type="button"
            onClick={() => navigate({ to: "/melik-plus" })}
            className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-[color:var(--ochre)] px-4 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            <Crown className="h-4 w-4" /> Mejorar a Melik+
          </button>
        </div>
      )}

      {profileReady && sub.kind === "free" && (
        <div className="mt-3">
          <p className="font-display text-xl font-semibold">Plan Actual: Gratuito</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Mejora a Melik+ para desbloquear Kiko ilimitado, el catálogo oficial y cero publicidad.
          </p>
          <button
            type="button"
            onClick={() => navigate({ to: "/melik-plus" })}
            className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-[color:var(--ochre)] px-4 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            <Crown className="h-4 w-4" /> Mejorar a Melik+
          </button>
        </div>
      )}

      <BakeryProgressPanel />

      <AlertDialog open={retentionOpen} onOpenChange={(o) => !busy && setRetentionOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Estás seguro de que quieres perder a Kiko ilimitado y el catálogo oficial?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {profile?.premium_until && isFuture(profile.premium_until)
                ? `Conservarás acceso a Melik+ hasta el ${formatSubDate(profile.premium_until)}. Después, tu cuenta volverá al plan Gratuito.`
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
    </section>
  );
}

/**
 * Progreso de meses acumulados hacia el próximo desbloqueo de Melik Bakery.
 * Cadencia: cada 6 meses de suscripción (mes 1, 7, 13, ...). Vista ciclo 12.
 * paidMonths >= 1). El servidor es la fuente de verdad — este panel es UI.
 */
function BakeryProgressPanel() {
  const { data } = useQuery({
    queryKey: ["bakery-entitlements"] as const,
    queryFn: () => getMyBakeryEntitlements(),
    staleTime: 60 * 1000,
  });
  if (!data) return null;
  const {
    paidMonthsTotal,
    unlocksAvailable,
    unlocksClaimed,
    unlocksEarned,
    cycleMonth,
    monthsToNextUnlock,
  } = data;
  if (paidMonthsTotal === 0 && unlocksEarned === 0) return null;

  // Progreso dentro del ciclo de 6 meses actual (visual, no absoluto).
  const positionInWindow = ((cycleMonth - 1) % 6) + (cycleMonth === 0 ? 0 : 0);
  const pct = Math.min(Math.max((positionInWindow / 6) * 100, 0), 100);

  return (
    <section className="mt-8 rounded-3xl border border-[color:var(--ochre)]/30 bg-gradient-to-br from-[color:var(--ochre)]/10 to-transparent p-5">
      <div className="flex items-center gap-2">
        <Crown className="h-4 w-4 text-[color:var(--ochre)]" />
        <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--ochre)]">
          Melik Bakery
        </p>
      </div>
      <p className="mt-3 font-display text-lg font-semibold">
        {unlocksAvailable > 0
          ? `Tienes ${unlocksAvailable} ${unlocksAvailable === 1 ? "desbloqueo disponible" : "desbloqueos disponibles"}`
          : `Mes ${cycleMonth} de tu ciclo Melik+`}
      </p>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-card">
        <div
          className="h-full rounded-full bg-[color:var(--ochre)] transition-[width] duration-500"
          style={{ width: `${pct}%` }}
          aria-hidden
        />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {unlocksAvailable > 0
          ? "Canjéalos por recetas oficiales en Melik Bakery."
          : `Faltan ${monthsToNextUnlock} ${
              monthsToNextUnlock === 1 ? "mes" : "meses"
            } para tu próximo desbloqueo.`}{" "}
        Reclamados: {unlocksClaimed} · Total ganados: {unlocksEarned}.
      </p>
    </section>
  );
}

// Admin panel access — SOLO visible para role === "admin".
// Ni `dev` ni `user` deben ver este botón bajo ninguna circunstancia.
// Doble gate: useIsAdmin (server check, fresh cada mount) + useProfile.role
// (realtime). Si cualquiera de los dos discrepa, el botón NO se renderiza.
function AdminSection() {
  const navigate = useNavigate();
  const { isAdmin, isLoading: adminLoading } = useIsAdmin();
  const { role, isLoading: profileLoading } = useProfile();
  if (adminLoading || profileLoading) return null;
  if (!isAdmin) return null;
  if (role !== "admin") return null;
  return (
    <section className="mt-8 rounded-2xl border border-dashed border-primary/40 bg-primary/5 px-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
            <Shield className="h-3.5 w-3.5" /> Modo administrador
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Accede al panel de administración para gestionar usuarios y contenidos.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate({ to: "/admin" })}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Abrir panel
        </button>
      </div>
    </section>
  );
}

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useModalA11y(onClose);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isPasswordStrong(password)) {
      setError("La contraseña no cumple los requisitos");
      return;
    }
    if (password !== confirm) {
      setError("Las contraseñas no coinciden");
      return;
    }
    setLoading(true);
    try {
      await changePassword({ data: { password } });
    } catch (err) {
      setLoading(false);
      setError(errorText(err));
      return;
    }
    setLoading(false);
    toast.success("Contraseña actualizada");
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 p-0 backdrop-blur-sm animate-fade-in sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-md rounded-t-3xl bg-background p-6 shadow-2xl animate-enter sm:rounded-3xl sm:p-8"
      >
        <button
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-xl text-foreground/60 hover:bg-card"
        >
          <X className="h-5 w-5" />
        </button>
        <h2 className="font-display text-2xl font-semibold">Cambiar contraseña</h2>
        <form onSubmit={submit} className="mt-6 grid gap-4">
          <label className="grid gap-1.5">
            <span className="text-xs font-medium text-foreground/80">Nueva contraseña</span>
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="h-11 w-full rounded-xl border border-border bg-card px-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <PasswordChecklist value={password} />
          <label className="grid gap-1.5">
            <span className="text-xs font-medium text-foreground/80">Confirmar</span>
            <input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              className="h-11 w-full rounded-xl border border-border bg-card px-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          {error && (
            <p className="rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="h-11 rounded-2xl bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? "Guardando…" : "Guardar"}
          </button>
        </form>
      </div>
    </div>
  );
}

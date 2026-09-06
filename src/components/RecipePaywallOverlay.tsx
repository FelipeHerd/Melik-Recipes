import { Crown, Lock, Sparkles, Loader2 } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";

/**
 * Overlay rendered on top of ViewRecipeModal's content when the server
 * returns a redacted recipe (ingredients + steps arrays are empty by design).
 * The overlay is presentational only — the sensitive data literally never
 * arrived in the browser.
 *
 * Con el nuevo modelo de desbloqueos, si el usuario ya es Melik+ y tiene
 * `unlocksAvailable > 0`, la CTA principal es **Canjear desbloqueo**. Si no
 * tiene desbloqueos, se le explica cuándo llega el próximo (mes 4, 7, 10…).
 */
export function RecipePaywallOverlay({
  isAuthenticated,
  isPremium = false,
  recipeTitle,
  unlocksAvailable = 0,
  nextUnlockAtMonth = 1,
  paidMonthsTotal = 0,
  onClaim,
  claiming = false,
}: {
  isAuthenticated: boolean;
  isPremium?: boolean;
  recipeTitle?: string;
  unlocksAvailable?: number;
  nextUnlockAtMonth?: number;
  paidMonthsTotal?: number;
  onClaim?: () => void;
  claiming?: boolean;
}) {
  const navigate = useNavigate();
  const canClaim = isPremium && unlocksAvailable > 0 && !!onClaim;

  const goSubscribe = () => {
    if (!isAuthenticated) {
      navigate({ to: "/auth", search: { redirect: "/melik-plus" } as never });
      return;
    }
    navigate({ to: "/melik-plus" });
  };

  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/70 p-6 text-center backdrop-blur-md">
      <div className="max-w-sm">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary/15 text-primary">
          <Crown className="h-7 w-7" />
        </div>
        <h3 className="mt-4 font-display text-xl font-semibold">
          Receta exclusiva Melik+
        </h3>

        {canClaim ? (
          <>
            <p className="mt-2 text-sm text-muted-foreground">
              Tienes <strong className="text-foreground">{unlocksAvailable}</strong>{" "}
              {unlocksAvailable === 1 ? "desbloqueo disponible" : "desbloqueos disponibles"}.
              Al canjear, {recipeTitle ? <>«{recipeTitle}»</> : "esta receta"} queda
              en tu recetario para siempre — incluso si cancelas Melik+.
            </p>
            <button
              type="button"
              onClick={onClaim}
              disabled={claiming}
              className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-70"
            >
              {claiming ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {claiming ? "Canjeando…" : "Canjear desbloqueo"}
            </button>
          </>
        ) : isPremium ? (
          <>
            <p className="mt-2 text-sm text-muted-foreground">
              Ya eres Melik+. Ganas un desbloqueo permanente cada 6 meses
              acumulados. {paidMonthsTotal > 0 && (
                <>Llevas <strong className="text-foreground">{paidMonthsTotal}</strong>{" "}
                {paidMonthsTotal === 1 ? "mes" : "meses"}. </>
              )}
              Faltan{" "}
              <strong className="text-foreground">
                {Math.max(nextUnlockAtMonth - paidMonthsTotal, 0)}
              </strong>{" "}
              {Math.max(nextUnlockAtMonth - paidMonthsTotal, 0) === 1 ? "mes" : "meses"} para el próximo.
            </p>
            <button
              type="button"
              disabled
              className="mt-5 inline-flex h-11 cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-border bg-card px-5 text-sm font-medium text-muted-foreground"
            >
              <Lock className="h-4 w-4" /> Sin desbloqueos disponibles
            </button>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-muted-foreground">
              {recipeTitle ? <>«{recipeTitle}» está</> : "Esta receta está"}{" "}
              reservada para miembros Melik+. Cada 6 meses acumulados de
              suscripción, ganas una receta oficial permanente.
            </p>
            <button
              type="button"
              onClick={goSubscribe}
              className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Lock className="h-4 w-4" />{" "}
              {isAuthenticated ? "Suscribirme a Melik+" : "Crear cuenta para suscribirse"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// In-app banner shown when the user has an active Melik+ trial
// (`premium_until > now()`) but is NOT permanently premium. Countdown
// updates every minute; user can dismiss for the current tab session.
import { useEffect, useMemo, useState } from "react";
import { Crown, X } from "lucide-react";
import { useProfile } from "@/lib/use-profile";

const DISMISS_KEY = "meliks.trialBanner.dismissed";

function formatRemaining(untilMs: number): string {
  const diff = untilMs - Date.now();
  if (diff <= 0) return "";
  const days = Math.floor(diff / 86_400_000);
  if (days >= 1) return `${days} día${days > 1 ? "s" : ""}`;
  const hours = Math.floor(diff / 3_600_000);
  if (hours >= 1) return `${hours} hora${hours > 1 ? "s" : ""}`;
  const mins = Math.max(1, Math.floor(diff / 60_000));
  return `${mins} minuto${mins > 1 ? "s" : ""}`;
}

export function TrialBanner() {
  const { isAuthenticated, isPremium, premiumUntil } = useProfile();
  const [dismissed, setDismissed] = useState(false);
  const [, tick] = useState(0);

  useEffect(() => {
    try {
      setDismissed(sessionStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      /* ignore */
    }
  }, []);

  const untilMs = useMemo(() => {
    if (!premiumUntil) return null;
    const t = new Date(premiumUntil).getTime();
    return Number.isFinite(t) ? t : null;
  }, [premiumUntil]);

  const active = !!isAuthenticated && !isPremium && !!untilMs && untilMs > Date.now();

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, [active]);

  if (!active || dismissed || !untilMs) return null;
  const remaining = formatRemaining(untilMs);
  if (!remaining) return null;

  return (
    <div className="fixed inset-x-3 top-3 z-40 mx-auto flex max-w-2xl items-center gap-3 rounded-2xl border border-[color:var(--ochre)]/60 bg-[color:var(--ochre)]/15 px-4 py-2.5 text-sm shadow-sm backdrop-blur md:left-1/2 md:right-auto md:-translate-x-1/2">
      <Crown className="h-4 w-4 shrink-0 text-[color:var(--ochre)]" />
      <p className="min-w-0 flex-1 text-foreground/90">
        Estás disfrutando Melik+ de prueba —{" "}
        <strong className="font-semibold">te quedan {remaining}</strong>.
      </p>
      <button
        type="button"
        aria-label="Ocultar aviso"
        onClick={() => {
          try {
            sessionStorage.setItem(DISMISS_KEY, "1");
          } catch {
            /* ignore */
          }
          setDismissed(true);
        }}
        className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-foreground/60 hover:bg-background/60 hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// Active-call bar for Kiko voice: animated waveform (ochre/green palette),
// countdown of remaining time and a red circular hang-up button.
import { PhoneOff, Mic } from "lucide-react";
import type { VoiceStatus } from "@/hooks/use-kiko-voice";

function formatTime(total: number): string {
  const m = Math.floor(Math.max(0, total) / 60);
  const s = Math.max(0, total) % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function VoiceCallBar({
  status,
  mode,
  levels,
  remaining,
  onHangUp,
}: {
  status: VoiceStatus;
  mode: "speaking" | "listening";
  levels: number[];
  remaining: number;
  onHangUp: () => void;
}) {
  const connecting = status === "connecting";
  const ending = status === "ending";
  const label = connecting
    ? "Conectando con Kiko…"
    : ending
      ? "Colgando…"
      : mode === "speaking"
        ? "Kiko está hablando"
        : "Te escucho…";

  return (
    <div className="relative m-3 shrink-0 overflow-hidden rounded-3xl border border-[color:var(--ochre)]/40 bg-[color:var(--ochre)]/10 p-3 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 flex-none place-items-center rounded-2xl bg-[color:var(--ochre)]/25 text-foreground">
          <Mic className="h-5 w-5" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold text-foreground">{label}</p>
            <span
              className="ml-auto flex-none font-mono text-xs tabular-nums text-muted-foreground"
              aria-label="Tiempo restante"
            >
              {formatTime(remaining)}
            </span>
          </div>
          <div className="mt-2 flex h-6 items-end gap-1" aria-hidden="true">
            {levels.map((v, i) => (
              <span
                key={i}
                className={`w-1.5 flex-none rounded-full transition-[height] duration-100 ease-out ${
                  mode === "speaking" ? "bg-primary" : "bg-[color:var(--ochre)]"
                } ${connecting || ending ? "animate-pulse" : ""}`}
                style={{ height: `${Math.round((connecting ? 0.3 : v) * 100)}%` }}
              />
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={onHangUp}
          disabled={ending}
          aria-label="Colgar llamada"
          title="Colgar"
          className="grid h-12 w-12 flex-none place-items-center rounded-full bg-destructive text-destructive-foreground shadow-lg shadow-destructive/30 transition hover:bg-destructive/90 disabled:opacity-50"
        >
          <PhoneOff className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

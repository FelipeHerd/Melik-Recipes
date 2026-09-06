// Inline fallback for failed reads (useQuery / useInfiniteQuery).
// Renders a compact block with the catalog title + a "Reintentar" button.
// Also exposes "Reportar problema" for high-severity failures.
import { RefreshCcw, Flag } from "lucide-react";
import { useQueryErrorResetBoundary } from "@tanstack/react-query";
import { toAppError } from "@/lib/errors/map";
import { isReportable, reportAppError } from "@/lib/errors/toast";
import type { AppErrorCode } from "@/lib/errors/codes";

export function QueryErrorFallback({
  error,
  onRetry,
  hint,
  compact,
}: {
  error: unknown;
  onRetry: () => void;
  hint?: AppErrorCode;
  compact?: boolean;
}) {
  const reset = useQueryErrorResetBoundary();
  const app = toAppError(error, hint);
  const handle = () => {
    reset.reset();
    onRetry();
  };
  const canReport = isReportable(app.code);
  return (
    <div
      role="alert"
      className={`mx-auto flex max-w-md flex-col items-center gap-3 rounded-2xl border border-border/60 bg-card p-5 text-center ${
        compact ? "text-xs" : "text-sm"
      }`}
    >
      <p className="font-display text-base font-semibold text-foreground">{app.title}</p>
      {app.description && <p className="text-muted-foreground">{app.description}</p>}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={handle}
          className="inline-flex h-9 items-center gap-2 rounded-xl bg-primary px-4 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          <RefreshCcw className="h-3.5 w-3.5" /> Reintentar
        </button>
        {canReport && (
          <button
            type="button"
            onClick={() =>
              reportAppError({
                code: app.code,
                title: app.title,
                description: app.description,
              })
            }
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-background px-4 text-xs font-medium text-foreground/80 hover:bg-muted"
          >
            <Flag className="h-3.5 w-3.5" /> Reportar problema
          </button>
        )}
      </div>
      {app.code && (
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
          Código: {app.code}
        </p>
      )}
    </div>
  );
}

// showError: unified error toast helper.
// USE ONLY inside mutations, submit handlers, and synchronous validation.
// NEVER attach to `useQuery` — Query retries would spam the user.
import { toast } from "sonner";
import type { AppErrorCode } from "./codes";
import { toAppError } from "./map";
import { ERRORS, REPORTABLE_ERROR_CODES } from "./catalog";
import { getSession } from "@/lib/auth/session-store";
import { reportError } from "@/lib/admin.functions";

function composeDescription(app: {
  code: AppErrorCode | "";
  description?: string;
}): string | undefined {
  const entry = app.code ? ERRORS[app.code as AppErrorCode] : undefined;
  const showCode = entry?.showCode === true;
  if (!showCode) return app.description;
  if (app.description) return `${app.description}\nCódigo: ${app.code}`;
  return `Código: ${app.code}`;
}

async function sendReport(app: { code: AppErrorCode | ""; title: string; description?: string }) {
  // Guard: sin sesión no permitimos reportes (evita spam anónimo).
  if (!getSession()) {
    toast.error("Inicia sesión para reportar");
    return;
  }
  try {
    const message = app.description ? `${app.title} — ${app.description}` : app.title;
    await reportError({
      data: {
        error_message: message.slice(0, 2000),
        route: typeof window !== "undefined" ? window.location.pathname : "",
        error_code: app.code || "",
      },
    });
    toast.success("Gracias, el equipo lo revisará.");
  } catch {
    toast.error("No pudimos enviar el reporte, inténtalo más tarde.");
  }
}

export function showError(err: unknown, hint?: AppErrorCode) {
  const app = toAppError(err, hint);
  const description = composeDescription(app);
  const reportable = !!app.code && REPORTABLE_ERROR_CODES.has(app.code as AppErrorCode);

  const options: Parameters<typeof toast.error>[1] = {};
  if (description) options.description = description;
  if (reportable) {
    options.action = {
      label: "Reportar problema",
      onClick: () => void sendReport(app),
    };
  }
  toast.error(app.title, Object.keys(options).length ? options : undefined);
  return app;
}

// Convenience for form-inline error strings (banner instead of toast).
export function errorText(err: unknown, hint?: AppErrorCode): string {
  const app = toAppError(err, hint);
  const description = composeDescription(app);
  return description ? `${app.title}. ${description}` : app.title;
}

// Exported so `QueryErrorFallback` (and similar) can offer the same action.
export function reportAppError(app: {
  code: AppErrorCode | "";
  title: string;
  description?: string;
}) {
  void sendReport(app);
}

export function isReportable(code: AppErrorCode | "" | undefined): boolean {
  return !!code && REPORTABLE_ERROR_CODES.has(code as AppErrorCode);
}

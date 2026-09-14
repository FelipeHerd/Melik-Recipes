// Client-side error reporting. Replaces the Lovable-hosted telemetry hook
// (window.__lovableEvents) that disappeared with the migration off Lovable —
// logs to the console for now; wire up a real APM/error-tracking service
// here if one is added later.
export function reportClientError(error: unknown, context: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  console.error("[error-reporting]", error, { route: window.location.pathname, ...context });
}

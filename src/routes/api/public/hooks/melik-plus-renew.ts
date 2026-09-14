// Renovación mensual/anual automática de Melik+ (simulada, sin pasarela real).
// Runs daily via the in-process scheduler (src/lib/cron/scheduler.server.ts).
// This HTTP route is kept as a manual-trigger escape hatch, gated by a
// shared secret — previously this endpoint had no auth check at all,
// relying on Supabase's pg_cron network path being the only caller.
import { createFileRoute } from "@tanstack/react-router";
import { createServerOnlyFn } from "@tanstack/react-start";

// Wrapped in createServerOnlyFn so the dynamic import of jobs.server.ts
// (a .server.ts-suffixed, import-protected module) isn't statically traced
// into the client bundle graph — server ROUTE handlers (unlike
// createServerFn handlers) aren't stripped from that graph automatically.
const handlePost = createServerOnlyFn(async (request: Request) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("x-cron-secret") !== secret) {
    return new Response("Forbidden", { status: 403 });
  }
  const { runMelikPlusRenew } = await import("@/lib/cron/jobs.server");
  const result = await runMelikPlusRenew();
  return new Response(JSON.stringify(result), {
    headers: { "Content-Type": "application/json" },
  });
});

const routeOptions = {
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => handlePost(request),
    },
  },
};

export const Route = createFileRoute("/api/public/hooks/melik-plus-renew")(routeOptions as never);

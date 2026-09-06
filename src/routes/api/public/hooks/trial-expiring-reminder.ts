// Recordatorio automático: aviso 3 días antes de que termine la prueba gratis Melik+.
// Se dispara por pg_cron una vez al día. Idempotente por prueba: sólo notifica
// una vez por ventana (usa `profiles.trial_expiring_notified_for`).
import { createFileRoute } from "@tanstack/react-router";

const routeOptions = {
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const now = new Date();
        const in3Days = new Date(now.getTime() + 3 * 86_400_000);

        const { data: candidates, error } = await supabaseAdmin
          .from("profiles")
          .select("id, premium_until, trial_expiring_notified_for")
          .eq("is_premium", false)
          .not("premium_until", "is", null)
          .gt("premium_until", now.toISOString())
          .lte("premium_until", in3Days.toISOString());

        if (error) {
          return new Response(JSON.stringify({ ok: false, error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        const pending = (candidates ?? []).filter(
          (p) => p.trial_expiring_notified_for !== p.premium_until,
        );

        let notified = 0;
        for (const p of pending) {
          if (!p.premium_until) continue;
          const endsAt = new Date(p.premium_until);
          const msLeft = endsAt.getTime() - now.getTime();
          const daysLeft = Math.max(1, Math.ceil(msLeft / 86_400_000));
          const dateLabel = endsAt.toLocaleDateString("es-ES", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          });
          const daysLabel = daysLeft === 1 ? "1 día" : `${daysLeft} días`;

          const { error: nErr } = await supabaseAdmin.from("notifications").insert({
            user_id: p.id,
            title: "⏳ Tu prueba de Melik+ está por terminar",
            message: `Te quedan ${daysLabel} de prueba gratis. Vence el ${dateLabel}. Suscríbete para no perder recetas ilimitadas, Kiko sin límites, el catálogo oficial y el 5% de descuento.`,
            type: "melik_plus",
          });
          if (nErr) continue;

          await supabaseAdmin
            .from("profiles")
            .update({ trial_expiring_notified_for: p.premium_until })
            .eq("id", p.id);
          notified++;
        }

        return new Response(
          JSON.stringify({ ok: true, scanned: candidates?.length ?? 0, notified }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
};

export const Route = createFileRoute("/api/public/hooks/trial-expiring-reminder")(
  routeOptions as never,
);

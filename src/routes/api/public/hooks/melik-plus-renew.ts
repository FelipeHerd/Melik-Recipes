// Renovación mensual/anual automática de Melik+ (simulada, sin pasarela real).
// Corre a diario vía pg_cron. Para cada suscripción `active` cuyo `premium_until`
// haya vencido, extiende el período según `billing_cycle`, incrementa
// `paid_months_total` (para la lógica de desbloqueos) y notifica al usuario.
// Para suscripciones `canceled` cuyo período pagado ya venció, baja al plan
// gratuito (`is_premium=false`, `subscription_status='inactive'`).
import { createFileRoute } from "@tanstack/react-router";

const routeOptions = {
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const now = new Date();
        const nowIso = now.toISOString();

        // 1) Renovar suscripciones activas vencidas.
        const { data: due, error } = await supabaseAdmin
          .from("profiles")
          .select("id, premium_until, billing_cycle, paid_months_total")
          .eq("subscription_status", "active")
          .not("premium_until", "is", null)
          .lte("premium_until", nowIso);

        if (error) {
          return new Response(
            JSON.stringify({ ok: false, error: error.message }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }

        let renewed = 0;
        let failed = 0;

        for (const p of due ?? []) {
          const cycle = (p.billing_cycle as "monthly" | "yearly" | null) ?? "monthly";
          const days = cycle === "yearly" ? 365 : 30;
          const monthsAdded = cycle === "yearly" ? 12 : 1;

          // Extiende desde el vencimiento previo para no perder tiempo.
          const prev = p.premium_until ? new Date(p.premium_until) : now;
          const base = prev.getTime() > now.getTime() ? prev : now;
          const nextUntil = new Date(base.getTime() + days * 86_400_000).toISOString();
          const nextTotal = (p.paid_months_total ?? 0) + monthsAdded;

          const { error: upErr } = await supabaseAdmin
            .from("profiles")
            .update({
              is_premium: true,
              premium_until: nextUntil,
              paid_months_total: nextTotal,
            })
            .eq("id", p.id);

          if (upErr) {
            failed++;
            continue;
          }

          const amount = cycle === "yearly" ? "$144.000 COP" : "$15.000 COP";
          const nextLabel = new Date(nextUntil).toLocaleDateString("es-ES", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          });
          await supabaseAdmin.from("notifications").insert({
            user_id: p.id,
            title: "✅ Renovamos tu suscripción Melik+",
            message: `Se procesó el cobro automático de ${amount}. Tu próximo cobro será el ${nextLabel}. Puedes cancelar cuando quieras desde tu perfil.`,
            type: "melik_plus",
          });

          renewed++;
        }

        // 2) Bajar suscripciones canceladas cuyo período ya venció.
        const { data: expired, error: expErr } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("subscription_status", "canceled")
          .not("premium_until", "is", null)
          .lte("premium_until", nowIso);

        let downgraded = 0;
        if (!expErr && expired) {
          for (const p of expired) {
            const { error: dErr } = await supabaseAdmin
              .from("profiles")
              .update({
                is_premium: false,
                subscription_status: "inactive",
                billing_cycle: null,
              })
              .eq("id", p.id);
            if (dErr) continue;

            await supabaseAdmin.from("notifications").insert({
              user_id: p.id,
              title: "Tu suscripción Melik+ terminó",
              message:
                "Tu período pagado terminó y tu cuenta volvió al plan gratuito. Puedes reactivar Melik+ cuando quieras desde tu perfil.",
              type: "melik_plus",
            });
            downgraded++;
          }
        }

        return new Response(
          JSON.stringify({ ok: true, renewed, failed, downgraded }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
};

export const Route = createFileRoute("/api/public/hooks/melik-plus-renew")(
  routeOptions as never,
);

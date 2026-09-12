// Scheduled job bodies, callable both from the in-process node-cron
// scheduler (scheduler.server.ts) and from the CRON_SECRET-gated HTTP
// routes under src/routes/api/public/hooks/ (kept as a manual-trigger
// escape hatch). Previously triggered by Supabase's pg_cron.

export async function runTrialExpiringReminder(): Promise<{ ok: true; scanned: number; notified: number }> {
  const { db } = await import("@/lib/db.server");

  const now = new Date();
  const in3Days = new Date(now.getTime() + 3 * 86_400_000);

  const candidates = await db
    .selectFrom("profiles")
    .select(["id", "premium_until", "trial_expiring_notified_for"])
    .where("is_premium", "=", false)
    .where("premium_until", "is not", null)
    .where("premium_until", ">", now)
    .where("premium_until", "<=", in3Days)
    .execute();

  const pending = candidates.filter((p) => {
    const notifiedFor = p.trial_expiring_notified_for ? p.trial_expiring_notified_for.getTime() : null;
    const premiumUntil = p.premium_until ? p.premium_until.getTime() : null;
    return notifiedFor !== premiumUntil;
  });

  let notified = 0;
  for (const p of pending) {
    if (!p.premium_until) continue;
    const endsAt = p.premium_until;
    const msLeft = endsAt.getTime() - now.getTime();
    const daysLeft = Math.max(1, Math.ceil(msLeft / 86_400_000));
    const dateLabel = endsAt.toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
    const daysLabel = daysLeft === 1 ? "1 día" : `${daysLeft} días`;

    try {
      await db
        .insertInto("notifications")
        .values({
          user_id: p.id,
          title: "⏳ Tu prueba de Melik+ está por terminar",
          message: `Te quedan ${daysLabel} de prueba gratis. Vence el ${dateLabel}. Suscríbete para no perder recetas ilimitadas, Kiko sin límites, el catálogo oficial y el 5% de descuento.`,
          type: "melik_plus",
        })
        .execute();
    } catch {
      continue;
    }

    await db.updateTable("profiles").set({ trial_expiring_notified_for: p.premium_until }).where("id", "=", p.id).execute();
    notified++;
  }

  return { ok: true, scanned: candidates.length, notified };
}

export async function runMelikPlusRenew(): Promise<{ ok: true; renewed: number; failed: number; downgraded: number }> {
  const { db } = await import("@/lib/db.server");
  const now = new Date();

  // 1) Renovar suscripciones activas vencidas.
  const due = await db
    .selectFrom("profiles")
    .select(["id", "premium_until", "billing_cycle", "paid_months_total"])
    .where("subscription_status", "=", "active")
    .where("premium_until", "is not", null)
    .where("premium_until", "<=", now)
    .execute();

  let renewed = 0;
  let failed = 0;

  for (const p of due) {
    const cycle = p.billing_cycle ?? "monthly";
    const days = cycle === "yearly" ? 365 : 30;
    const monthsAdded = cycle === "yearly" ? 12 : 1;

    // Extiende desde el vencimiento previo para no perder tiempo.
    const prev = p.premium_until ?? now;
    const base = prev.getTime() > now.getTime() ? prev : now;
    const nextUntil = new Date(base.getTime() + days * 86_400_000);
    const nextTotal = (p.paid_months_total ?? 0) + monthsAdded;

    try {
      await db
        .updateTable("profiles")
        .set({ is_premium: true, premium_until: nextUntil, paid_months_total: nextTotal })
        .where("id", "=", p.id)
        .execute();
    } catch {
      failed++;
      continue;
    }

    const amount = cycle === "yearly" ? "$144.000 COP" : "$15.000 COP";
    const nextLabel = nextUntil.toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
    await db
      .insertInto("notifications")
      .values({
        user_id: p.id,
        title: "✅ Renovamos tu suscripción Melik+",
        message: `Se procesó el cobro automático de ${amount}. Tu próximo cobro será el ${nextLabel}. Puedes cancelar cuando quieras desde tu perfil.`,
        type: "melik_plus",
      })
      .execute();

    renewed++;
  }

  // 2) Bajar suscripciones canceladas cuyo período ya venció.
  const expired = await db
    .selectFrom("profiles")
    .select(["id"])
    .where("subscription_status", "=", "canceled")
    .where("premium_until", "is not", null)
    .where("premium_until", "<=", now)
    .execute();

  let downgraded = 0;
  for (const p of expired) {
    try {
      await db
        .updateTable("profiles")
        .set({ is_premium: false, subscription_status: "inactive", billing_cycle: null })
        .where("id", "=", p.id)
        .execute();
    } catch {
      continue;
    }

    await db
      .insertInto("notifications")
      .values({
        user_id: p.id,
        title: "Tu suscripción Melik+ terminó",
        message: "Tu período pagado terminó y tu cuenta volvió al plan gratuito. Puedes reactivar Melik+ cuando quieras desde tu perfil.",
        type: "melik_plus",
      })
      .execute();
    downgraded++;
  }

  return { ok: true, renewed, failed, downgraded };
}

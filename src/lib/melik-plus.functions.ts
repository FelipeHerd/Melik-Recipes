// Melik+ mock payments + bakery entitlements (server functions).
// SECURITY: all mutations of `paid_months_total` and `bakery_unlocks` go
// through authenticated handlers using `context.userId` — the client never
// decides entitlements. `db` is imported dynamically inside each handler to
// keep server-only code out of the client bundle.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/require-auth.server";

export type PaymentProvider = "stripe" | "mercadopago" | "mock";

export type PaymentGatewayErrorCode =
  | "GATEWAY_CONNECTION_ERROR"
  | "CARD_DECLINED"
  | "INVALID_PAYMENT_DETAILS"
  | "PROVIDER_UNAVAILABLE"
  | "UNKNOWN_ERROR";

export interface PaymentGatewayError {
  code: PaymentGatewayErrorCode;
  message: string;
  provider?: PaymentProvider;
  rawError?: string;
}

export interface CheckoutTransactionRequest {
  billing: "monthly" | "yearly";
  provider?: PaymentProvider;
  cardDetails?: {
    name: string;
    number: string;
    expiry: string;
    cvc: string;
  };
  outcome?: "success" | "error" | "connection_error" | "card_declined";
}

export interface CheckoutTransactionResult {
  success: boolean;
  subscriptionId?: string;
  error?: PaymentGatewayError;
  premiumUntil?: string;
  billing?: "monthly" | "yearly";
  paidMonthsTotal?: number;
  provider?: PaymentProvider;
  ok?: boolean;
}

const paymentSchema = z.object({
  billing: z.enum(["monthly", "yearly"]),
  provider: z.enum(["stripe", "mercadopago", "mock"]).optional().default("mock"),
  outcome: z.enum(["success", "error", "connection_error", "card_declined"]).optional(),
  cardDetails: z.object({
    name: z.string().optional(),
    number: z.string().optional(),
    expiry: z.string().optional(),
    cvc: z.string().optional(),
  }).optional(),
});

export const simulateMelikPlusPayment = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => paymentSchema.parse(input))
  .handler(async ({ data, context }): Promise<CheckoutTransactionResult> => {
    // Latencia fija — simulador de red.
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const selectedProvider: PaymentProvider = data.provider ?? "mock";

    // Simulación de error de conexión con la pasarela de pagos (R4 / M4)
    if (
      selectedProvider === "stripe" ||
      selectedProvider === "mercadopago" ||
      data.outcome === "error" ||
      data.outcome === "connection_error"
    ) {
      const providerLabel =
        selectedProvider === "stripe"
          ? "Stripe"
          : selectedProvider === "mercadopago"
          ? "MercadoPago"
          : "Pasarela de Pagos";

      return {
        success: false,
        provider: selectedProvider,
        error: {
          code: "GATEWAY_CONNECTION_ERROR",
          message: `No se pudo establecer conexión segura con el servidor de pagos (${providerLabel}). Por favor verifica tu conexión a internet o intenta nuevamente.`,
          provider: selectedProvider,
        },
      };
    }

    if (data.outcome === "card_declined") {
      return {
        success: false,
        provider: selectedProvider,
        error: {
          code: "CARD_DECLINED",
          message: "Tu tarjeta fue rechazada por el banco emisor. Por favor intenta con otro método de pago.",
          provider: selectedProvider,
        },
      };
    }

    const monthsPaid = data.billing === "monthly" ? 1 : 12;
    const days = data.billing === "monthly" ? 30 : 365;
    const premiumUntil = new Date(Date.now() + days * 86_400_000).toISOString();

    const { db } = await import("@/lib/db.server");

    let nextTotal: number;
    try {
      // Leer el contador actual para incrementar de forma atómica.
      const current = await db
        .selectFrom("profiles")
        .select(["paid_months_total"])
        .where("id", "=", context.userId)
        .executeTakeFirst();
      nextTotal = (current?.paid_months_total ?? 0) + monthsPaid;

      await db
        .updateTable("profiles")
        .set({
          is_premium: true,
          premium_until: premiumUntil,
          subscription_status: "active",
          paid_months_total: nextTotal,
          billing_cycle: data.billing,
        })
        .where("id", "=", context.userId)
        .execute();
    } catch (err) {
      return {
        success: false,
        provider: selectedProvider,
        error: {
          code: "UNKNOWN_ERROR",
          message: "No pudimos guardar los cambios de tu suscripción. Intenta de nuevo.",
          provider: selectedProvider,
          rawError: err instanceof Error ? err.message : String(err),
        },
      };
    }

    // Notificación de bienvenida a Melik+ (helper centralizado con dedup + logging).
    const { sendTemplatedNotification } = await import("./notifications.server");
    await sendTemplatedNotification(
      context.userId,
      data.billing === "yearly" ? "welcome_plus_yearly" : "welcome_plus_monthly",
    );

    const subscriptionId = `sub_mock_${Date.now()}`;

    return {
      success: true,
      ok: true,
      subscriptionId,
      premiumUntil,
      billing: data.billing,
      paidMonthsTotal: nextTotal,
      provider: selectedProvider,
    };
  });

export const processPaymentGatewayCheckout = simulateMelikPlusPayment;

export const cancelMockSubscription = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const { db, isoOrNull } = await import("@/lib/db.server");
    let premiumUntil: Date | null;
    try {
      const row = await db
        .updateTable("profiles")
        .set({ subscription_status: "canceled" })
        .where("id", "=", context.userId)
        .returning(["premium_until"])
        .executeTakeFirst();
      premiumUntil = row?.premium_until ?? null;
    } catch {
      throw new Error("No pudimos cancelar tu suscripción. Intenta de nuevo.");
    }

    return {
      ok: true as const,
      premium_until: isoOrNull(premiumUntil),
    };
  });

// ============================================================
// Bakery entitlements: contador de meses + desbloqueos permanentes
// ============================================================

/**
 * Cadencia de desbloqueos: se otorga uno en el mes 1, 7, 13, 19, ...
 * (cada 6 meses, comenzando en el mes 1). Un plan anual acumula 12 meses
 * de golpe, así que el usuario recibe automáticamente 2 desbloqueos.
 *
 * Vista del usuario: ciclo visual de 12 meses. Después del mes 12 el
 * contador visible vuelve al mes 1. El contador absoluto sigue creciendo
 * en DB y se usa para la vista admin.
 */
const UNLOCK_CADENCE_MONTHS = 6;
const USER_CYCLE_MONTHS = 12;

export function computeUnlockStats(paidMonthsTotal: number) {
  const earned =
    paidMonthsTotal >= 1
      ? Math.floor((paidMonthsTotal - 1) / UNLOCK_CADENCE_MONTHS) + 1
      : 0;
  const nextUnlockAtMonth =
    paidMonthsTotal < 1 ? 1 : earned * UNLOCK_CADENCE_MONTHS + 1;
  const monthsToNextUnlock = Math.max(nextUnlockAtMonth - paidMonthsTotal, 0);
  const cycleMonth =
    paidMonthsTotal < 1 ? 0 : ((paidMonthsTotal - 1) % USER_CYCLE_MONTHS) + 1;
  return { earned, nextUnlockAtMonth, monthsToNextUnlock, cycleMonth };
}

export type BakeryEntitlements = {
  paidMonthsTotal: number;
  /** Ciclo visual 1..12 (0 si aún no hay pagos). Reinicia después del mes 12. */
  cycleMonth: number;
  unlocksEarned: number;
  unlocksClaimed: number;
  unlocksAvailable: number;
  unlockedRecipeIds: string[];
  /** Mes absoluto en el que llega el próximo desbloqueo. */
  nextUnlockAtMonth: number;
  /** Meses que faltan para el próximo desbloqueo. */
  monthsToNextUnlock: number;
};

export const getMyBakeryEntitlements = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<BakeryEntitlements> => {
    const { db } = await import("@/lib/db.server");

    const [profile, unlocks] = await Promise.all([
      db.selectFrom("profiles").select(["paid_months_total"]).where("id", "=", context.userId).executeTakeFirst(),
      db.selectFrom("bakery_unlocks").select(["recipe_id"]).where("user_id", "=", context.userId).execute(),
    ]);

    const paidMonthsTotal = profile?.paid_months_total ?? 0;
    const unlocksClaimed = unlocks.length;
    const { earned, nextUnlockAtMonth, monthsToNextUnlock, cycleMonth } = computeUnlockStats(paidMonthsTotal);
    const unlocksAvailable = Math.max(earned - unlocksClaimed, 0);

    return {
      paidMonthsTotal,
      cycleMonth,
      unlocksEarned: earned,
      unlocksClaimed,
      unlocksAvailable,
      unlockedRecipeIds: unlocks.map((u) => u.recipe_id),
      nextUnlockAtMonth,
      monthsToNextUnlock,
    };
  });

export const claimBakeryUnlock = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: { recipeId: string }) => z.object({ recipeId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { db } = await import("@/lib/db.server");
    const { sql } = await import("kysely");

    // 1) Receta debe ser oficial + premium-only. Recetas oficiales no premium
    //    no requieren desbloqueo (gratuitas).
    const recipe = await db
      .selectFrom("recipes")
      .select(["id", "is_official_melik", "is_premium_only"])
      .where("id", "=", data.recipeId)
      .executeTakeFirst();
    if (!recipe || !recipe.is_official_melik) {
      throw new Error("APP-RCP-001: not found");
    }
    if (!recipe.is_premium_only) {
      // No hay nada que desbloquear.
      return { alreadyOpen: true as const };
    }

    // 2) Si ya está desbloqueada por este usuario, no consumimos nada.
    const existing = await db
      .selectFrom("bakery_unlocks")
      .select(["user_id"])
      .where("user_id", "=", context.userId)
      .where("recipe_id", "=", data.recipeId)
      .executeTakeFirst();
    if (existing) {
      return { alreadyClaimed: true as const };
    }

    // 3) Calcular disponibles.
    const [profile, claimedRow] = await Promise.all([
      db.selectFrom("profiles").select(["paid_months_total"]).where("id", "=", context.userId).executeTakeFirst(),
      db
        .selectFrom("bakery_unlocks")
        .select(sql<number>`count(*)`.as("count"))
        .where("user_id", "=", context.userId)
        .executeTakeFirstOrThrow(),
    ]);
    const paidMonthsTotal = profile?.paid_months_total ?? 0;
    const claimed = Number(claimedRow.count);
    const { earned } = computeUnlockStats(paidMonthsTotal);
    const available = Math.max(earned - claimed, 0);

    if (available <= 0) {
      throw new Error("APP-PAY-002: no unlocks available");
    }

    // 4) Insertar (idempotente vía PK).
    try {
      await db.insertInto("bakery_unlocks").values({ user_id: context.userId, recipe_id: data.recipeId }).execute();
    } catch (err) {
      throw new Error("APP-SYS-001: " + (err instanceof Error ? err.message : String(err)));
    }

    return {
      ok: true as const,
      unlocksAvailable: available - 1,
    };
  });

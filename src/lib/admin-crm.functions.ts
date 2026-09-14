// Admin CRM — Tab 2: search, block Kiko, grant trials, change role, impersonate.
// All calls: requireAuth → assertAdmin (admin ONLY; dev is NOT admin) → db → audit.
import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "@/lib/auth/require-auth";
import { z } from "zod";

type Role = "user" | "admin" | "dev";

async function callerRole(userId: string): Promise<Role> {
  const { db } = await import("@/lib/db.server");
  const rows = await db
    .selectFrom("user_roles")
    .select(["role"])
    .where("user_id", "=", userId)
    .where("role", "in", ["admin", "dev"])
    .execute();
  const roles = rows.map((r) => r.role);
  if (roles.includes("admin")) return "admin";
  if (roles.includes("dev")) return "dev";
  return "user";
}

async function assertAdmin(userId: string): Promise<Role> {
  const role = await callerRole(userId);
  if (role !== "admin") {
    throw new Error("APP-PERM-002: forbidden");
  }
  return role;
}

async function audit(
  adminId: string,
  action: string,
  targetUserId: string | null,
  metadata: Record<string, unknown> = {},
) {
  const { db, toJsonb } = await import("@/lib/db.server");
  await db
    .insertInto("admin_audit_log")
    .values({
      admin_id: adminId,
      action,
      target_user_id: targetUserId,
      metadata: toJsonb(metadata),
    })
    .execute();
}

async function sendNotifInternal(
  userId: string,
  title: string,
  message: string,
  type: "system" | "kiko" | "melik_plus" | "admin",
) {
  const { db } = await import("@/lib/db.server");
  await db.insertInto("notifications").values({ user_id: userId, title, message, type }).execute();
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

// -------------------------- Search ------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AdminCrmRow = {
  userId: string;
  email: string | null;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  role: Role;
  isPremium: boolean;
  premiumUntil: string | null;
  kikoBlockedUntil: string | null;
  createdAt: string | null;
  paidMonthsTotal: number;
};

const searchSchema = z.object({ q: z.string().trim().min(1).max(200) });

export const searchAdminUsersV2 = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => searchSchema.parse(input))
  .handler(async ({ data, context }): Promise<AdminCrmRow[]> => {
    await assertAdmin(context.userId);
    const { db, isoOrNull } = await import("@/lib/db.server");
    const { getUserById, searchUsersByEmail } = await import("@/lib/auth/admin-users.server");
    const q = data.q.trim();

    type AuthUser = { id: string; email: string | null; created_at: Date };
    let matches: AuthUser[] = [];

    if (UUID_RE.test(q)) {
      const user = await getUserById(q);
      if (user) matches.push(user);
    } else if (q.includes("@")) {
      matches = (await searchUsersByEmail(q.toLowerCase(), 25)) as AuthUser[];
    } else {
      const needle = q.toLowerCase().replace(/[%_]/g, "");
      const profs = await db
        .selectFrom("profiles")
        .select(["id"])
        .where("username", "ilike", `%${needle}%`)
        .limit(25)
        .execute();
      const results = await Promise.all(profs.map((p) => getUserById(p.id)));
      for (const u of results) if (u) matches.push(u);
    }

    if (matches.length === 0) return [];

    const ids = matches.map((m) => m.id);
    const [profs, roles] = await Promise.all([
      db
        .selectFrom("profiles")
        .select([
          "id",
          "username",
          "first_name",
          "last_name",
          "avatar_url",
          "is_premium",
          "premium_until",
          "kiko_blocked_until",
          "paid_months_total",
        ])
        .where("id", "in", ids)
        .execute(),
      db.selectFrom("user_roles").select(["user_id", "role"]).where("user_id", "in", ids).execute(),
    ]);

    const profMap = new Map(profs.map((p) => [p.id, p]));
    const roleMap = new Map<string, Role>();
    roles.forEach((r) => {
      const current = roleMap.get(r.user_id);
      const rank = (x: string) => (x === "admin" ? 2 : x === "dev" ? 1 : 0);
      if (!current || rank(r.role) > rank(current)) roleMap.set(r.user_id, r.role as Role);
    });

    return matches.map((m) => {
      const p = profMap.get(m.id);
      return {
        userId: m.id,
        email: m.email,
        username: p?.username ?? null,
        firstName: p?.first_name ?? null,
        lastName: p?.last_name ?? null,
        avatarUrl: p?.avatar_url ?? null,
        role: roleMap.get(m.id) ?? "user",
        isPremium: !!p?.is_premium,
        premiumUntil: isoOrNull(p?.premium_until),
        kikoBlockedUntil: isoOrNull(p?.kiko_blocked_until),
        createdAt: isoOrNull(m.created_at),
        paidMonthsTotal: p?.paid_months_total ?? 0,
      };
    });
  });

// -------------------------- Kiko block --------------------------------------

const kikoSchema = z.object({
  userId: z.string().uuid(),
  until: z.string().datetime().nullable(),
});

export const setKikoBlock = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => kikoSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertAdmin(context.userId);
    const { db } = await import("@/lib/db.server");
    await db
      .updateTable("profiles")
      .set({ kiko_blocked_until: data.until })
      .where("id", "=", data.userId)
      .execute();

    if (data.until) {
      await sendNotifInternal(
        data.userId,
        "Kiko en pausa",
        `Un administrador pausó tu acceso a Kiko hasta el ${formatDate(data.until)}. Si crees que es un error, escríbenos.`,
        "kiko",
      );
      await audit(context.userId, "kiko_block", data.userId, { until: data.until });
    } else {
      await sendNotifInternal(
        data.userId,
        "Kiko disponible otra vez",
        "Ya puedes volver a chatear con Kiko. ¡Gracias por tu paciencia!",
        "kiko",
      );
      await audit(context.userId, "kiko_unblock", data.userId);
    }
    return { ok: true };
  });

// -------------------------- Trials ------------------------------------------

const trialSchema = z.object({
  userId: z.string().uuid(),
  days: z.number().int().min(1).max(365).nullable(),
});

export const grantTrial = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => trialSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ premiumUntil: string | null }> => {
    await assertAdmin(context.userId);
    const { db } = await import("@/lib/db.server");

    if (data.days === null) {
      await db
        .updateTable("profiles")
        .set({ premium_until: null })
        .where("id", "=", data.userId)
        .execute();
      await audit(context.userId, "trial_revoke", data.userId);
      return { premiumUntil: null };
    }

    // Nueva expiración = max(now, premium_until_actual) + days
    const current = await db
      .selectFrom("profiles")
      .select(["premium_until"])
      .where("id", "=", data.userId)
      .executeTakeFirst();
    const nowMs = Date.now();
    const baseMs = current?.premium_until
      ? Math.max(nowMs, new Date(current.premium_until).getTime())
      : nowMs;
    const nextIso = new Date(baseMs + data.days * 86_400_000).toISOString();

    await db
      .updateTable("profiles")
      .set({ premium_until: nextIso, trial_expiring_notified_for: null })
      .where("id", "=", data.userId)
      .execute();

    const durationLabel =
      data.days === 1
        ? "1 día"
        : data.days < 30
          ? `${data.days} días`
          : data.days === 30
            ? "1 mes"
            : `${data.days} días`;
    await sendNotifInternal(
      data.userId,
      "🎁 Recibiste una prueba gratis de Melik+",
      `Te regalamos ${durationLabel} de prueba gratis en Melik+. Disfruta recetas ilimitadas, Kiko sin límites, catálogo oficial y 5% de descuento en tus compras. Tu prueba vence el ${formatDate(nextIso)}.`,
      "melik_plus",
    );
    await audit(context.userId, "trial_grant", data.userId, { days: data.days, until: nextIso });
    return { premiumUntil: nextIso };
  });

// -------------------------- Role change -------------------------------------

const roleSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["user", "admin", "dev"]),
});

export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => roleSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertAdmin(context.userId);
    if (data.userId === context.userId) {
      throw new Error("APP-PERM-002: no puedes cambiar tu propio rol");
    }
    const { db } = await import("@/lib/db.server");
    const { sql } = await import("kysely");

    const prev = await db
      .selectFrom("profiles")
      .select(["role"])
      .where("id", "=", data.userId)
      .executeTakeFirst();
    const prevRole = (prev?.role ?? "user") as Role;

    // Last-admin guard: no permitas degradar al último admin.
    if (prevRole === "admin" && data.role !== "admin") {
      const { count } = await db
        .selectFrom("user_roles")
        .select(sql<number>`count(*)`.as("count"))
        .where("role", "=", "admin")
        .executeTakeFirstOrThrow();
      if (Number(count) <= 1) {
        throw new Error("APP-PERM-003: no puedes dejar la app sin admins");
      }
    }

    // Escritura dual + normalización a exactamente un rol en `user_roles`.
    await db.transaction().execute(async (trx) => {
      await trx
        .updateTable("profiles")
        .set({ role: data.role })
        .where("id", "=", data.userId)
        .execute();
      await trx.deleteFrom("user_roles").where("user_id", "=", data.userId).execute();
      if (data.role !== "user") {
        await trx
          .insertInto("user_roles")
          .values({ user_id: data.userId, role: data.role })
          .execute();
      }
    });

    // Notificación al destinatario según el rol final (helper centralizado).
    if (data.role !== prevRole) {
      const { sendTemplatedNotification } = await import("./notifications.server");
      if (data.role === "admin") {
        await sendTemplatedNotification(data.userId, "role_promoted");
      } else if (data.role === "dev") {
        await sendTemplatedNotification(data.userId, "role_promoted_dev");
      } else if (prevRole !== "user") {
        await sendTemplatedNotification(data.userId, "role_revoked");
      }
    }

    await audit(context.userId, "role_change", data.userId, { from: prevRole, to: data.role });
    return { ok: true };
  });

// -------------------------- Impersonate -------------------------------------
//
// Returns a short-lived (5 min) token directly instead of an emailed magic
// link — there's no email step in this architecture. The admin panel's
// "impersonate" button swaps the CURRENT tab's session to this token (see
// UserActionsDrawer.tsx), so the admin should expect to be logged in as the
// target user afterward, not the other way around.

const impersonateSchema = z.object({ userId: z.string().uuid() });

export const generateImpersonationToken = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => impersonateSchema.parse(input))
  .handler(
    async ({
      data,
      context,
    }): Promise<{ token: string; email: string; userId: string; exp: number }> => {
      await assertAdmin(context.userId); // solo admin.
      const { generateImpersonationToken: issue } = await import("@/lib/auth/admin-users.server");
      const { token, email } = await issue(data.userId, context.userId);
      await audit(context.userId, "impersonate", data.userId, { email });
      return { token, email, userId: data.userId, exp: Math.floor(Date.now() / 1000) + 5 * 60 };
    },
  );

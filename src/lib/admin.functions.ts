// Admin & notifications server functions.
// Protected calls check role via `assertAdmin` (admin ONLY — dev accounts do
// NOT get panel access). Report/notification reads and writes for the
// current user are scoped by an explicit `user_id` filter on every query,
// replacing what Supabase RLS used to enforce implicitly.
import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "@/lib/auth/require-auth.server";
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

export const checkIsAdmin = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<{ isAdmin: boolean; isDev: boolean; role: Role }> => {
    const role = await callerRole(context.userId);
    return { isAdmin: role === "admin", isDev: role === "dev", role };
  });

export type AdminStats = {
  totalUsers: number;
  totalRecipes: number;
  officialRecipes: number;
  avgRecipesPerUser: number;
};

export const getAdminStats = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<AdminStats> => {
    const { assertAdmin } = await import("@/lib/auth/authorize.server");
    await assertAdmin(context.userId);
    const { db } = await import("@/lib/db.server");
    const { sql } = await import("kysely");

    const [usersRow, recipesRow, officialRow] = await Promise.all([
      db.selectFrom("profiles").select(sql<number>`count(*)`.as("count")).executeTakeFirstOrThrow(),
      db
        .selectFrom("recipes")
        .select(sql<number>`count(*)`.as("count"))
        .where("is_official_melik", "=", false)
        .executeTakeFirstOrThrow(),
      db
        .selectFrom("recipes")
        .select(sql<number>`count(*)`.as("count"))
        .where("is_official_melik", "=", true)
        .executeTakeFirstOrThrow(),
    ]);

    const totalUsers = Number(usersRow.count);
    const totalRecipes = Number(recipesRow.count);
    const officialRecipes = Number(officialRow.count);
    const avg = totalUsers > 0 ? totalRecipes / totalUsers : 0;

    return {
      totalUsers,
      totalRecipes,
      officialRecipes,
      avgRecipesPerUser: Math.round(avg * 100) / 100,
    };
  });

const searchSchema = z.object({ email: z.string().min(1).max(200) });

export type AdminUserRow = {
  userId: string;
  email: string | null;
  fullName: string;
  isPremium: boolean;
  isAdmin: boolean;
  recipeCount: number;
};

export const searchAdminUsers = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => searchSchema.parse(input))
  .handler(async ({ data, context }): Promise<AdminUserRow[]> => {
    const { assertAdmin } = await import("@/lib/auth/authorize.server");
    await assertAdmin(context.userId);
    const { db } = await import("@/lib/db.server");
    const { searchUsersByEmail } = await import("@/lib/auth/admin-users.server");

    const matches = await searchUsersByEmail(data.email.toLowerCase(), 25);
    if (matches.length === 0) return [];

    const ids = matches.map((u) => u.id);
    const [profs, roles, recipes] = await Promise.all([
      db.selectFrom("profiles").select(["id", "first_name", "last_name", "is_premium"]).where("id", "in", ids).execute(),
      db.selectFrom("user_roles").select(["user_id", "role"]).where("user_id", "in", ids).execute(),
      db
        .selectFrom("recipes")
        .select(["user_id"])
        .where("user_id", "in", ids)
        .where("is_official_melik", "=", false)
        .execute(),
    ]);

    const profMap = new Map(profs.map((p) => [p.id, p]));
    const adminSet = new Set(roles.filter((r) => r.role === "admin").map((r) => r.user_id));
    const countMap = new Map<string, number>();
    for (const r of recipes) {
      countMap.set(r.user_id, (countMap.get(r.user_id) ?? 0) + 1);
    }

    return matches.map((u) => {
      const p = profMap.get(u.id);
      const fullName = [p?.first_name, p?.last_name].filter(Boolean).join(" ").trim();
      return {
        userId: u.id,
        email: u.email ?? null,
        fullName: fullName || "—",
        isPremium: !!p?.is_premium,
        isAdmin: adminSet.has(u.id),
        recipeCount: countMap.get(u.id) ?? 0,
      };
    });
  });

// NOTE: `toggleDevAdmin` was removed. Dev accounts cannot self-promote to
// admin — the only path to the admin role is `setUserRole` invoked by an
// existing admin from /admin/usuarios.

// -------------------------- Error reports -----------------------------------

const reportSchema = z.object({
  error_message: z.string().trim().min(1).max(2000),
  route: z.string().trim().max(500).optional().default(""),
  error_code: z.string().trim().max(120).optional().default(""),
});

export const reportError = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => reportSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { db } = await import("@/lib/db.server");
    const { sql } = await import("kysely");

    // Rate limit blando: máx 20 reportes por hora por usuario.
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const { count } = await db
      .selectFrom("error_reports")
      .select(sql<number>`count(*)`.as("count"))
      .where("user_id", "=", context.userId)
      .where("created_at", ">=", oneHourAgo)
      .executeTakeFirstOrThrow();
    if (Number(count) >= 20) {
      throw new Error("APP-AUTH-004: too many reports");
    }

    await db
      .insertInto("error_reports")
      .values({
        user_id: context.userId,
        error_message: data.error_message,
        route: data.route || null,
        error_code: data.error_code || null,
      })
      .execute();
    return { ok: true };
  });

// -------------------------- Notifications -----------------------------------

const NOTIF_TYPES = ["system", "kiko", "melik_plus", "admin"] as const;
type NotifType = (typeof NOTIF_TYPES)[number];

const sendNotifSchema = z.object({
  userId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(2000),
  type: z.enum(NOTIF_TYPES).default("system"),
});

export const sendNotification = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => sendNotifSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true; id: string }> => {
    const { assertAdmin } = await import("@/lib/auth/authorize.server");
    await assertAdmin(context.userId);
    const { db } = await import("@/lib/db.server");
    const row = await db
      .insertInto("notifications")
      .values({ user_id: data.userId, title: data.title, message: data.message, type: data.type })
      .returning(["id"])
      .executeTakeFirstOrThrow();
    // TODO(realtime phase): push a WS event to data.userId here — see
    // migration plan Section 3.7 / src/lib/realtime/notify.server.ts.
    return { ok: true, id: row.id };
  });

export type NotificationRow = {
  id: string;
  title: string;
  message: string;
  type: NotifType;
  is_read: boolean;
  created_at: string;
};

export const listMyNotifications = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<NotificationRow[]> => {
    const { db, isoOrNull } = await import("@/lib/db.server");
    const rows = await db
      .selectFrom("notifications")
      .select(["id", "title", "message", "type", "is_read", "created_at"])
      .where("user_id", "=", context.userId)
      .orderBy("created_at", "desc")
      .limit(100)
      .execute();
    return rows.map((r) => ({ ...r, created_at: isoOrNull(r.created_at) as string }));
  });

const notifIdSchema = z.object({ id: z.string().uuid() });

export const markNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => notifIdSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { db } = await import("@/lib/db.server");
    await db
      .updateTable("notifications")
      .set({ is_read: true })
      .where("id", "=", data.id)
      .where("user_id", "=", context.userId)
      .execute();
    return { ok: true };
  });

export const deleteNotification = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => notifIdSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { db } = await import("@/lib/db.server");
    await db.deleteFrom("notifications").where("id", "=", data.id).where("user_id", "=", context.userId).execute();
    return { ok: true };
  });

// Contador liviano para el badge de la campana.
export const getMyUnreadNotificationsCount = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<{ count: number }> => {
    const { db } = await import("@/lib/db.server");
    const { sql } = await import("kysely");
    const { count } = await db
      .selectFrom("notifications")
      .select(sql<number>`count(*)`.as("count"))
      .where("user_id", "=", context.userId)
      .where("is_read", "=", false)
      .executeTakeFirstOrThrow();
    return { count: Number(count) };
  });

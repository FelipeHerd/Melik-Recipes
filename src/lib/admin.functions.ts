// Admin & notifications server functions.
// Protected calls check role via `assertAdmin` (admin ONLY — dev accounts do
// NOT get panel access). Report/notification reads and writes for the current
// user go through RLS.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

type Role = "user" | "admin" | "dev";

async function callerRole(userId: string): Promise<Role> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: adminRow } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "dev"]);
  const roles = (adminRow ?? []).map((r) => r.role);
  if (roles.includes("admin")) return "admin";
  if (roles.includes("dev")) return "dev";
  return "user";
}

async function assertAdmin(userId: string) {
  const role = await callerRole(userId);
  if (role !== "admin") {
    throw new Error("APP-PERM-002: forbidden");
  }
}

export const checkIsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
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
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminStats> => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [profilesCount, recipesCount, officialCount] = await Promise.all([
      supabaseAdmin.from("profiles").select("*", { count: "exact", head: true }),
      supabaseAdmin
        .from("recipes")
        .select("*", { count: "exact", head: true })
        .eq("is_official_melik", false),
      supabaseAdmin
        .from("recipes")
        .select("*", { count: "exact", head: true })
        .eq("is_official_melik", true),
    ]);

    const totalUsers = profilesCount.count ?? 0;
    const totalRecipes = recipesCount.count ?? 0;
    const officialRecipes = officialCount.count ?? 0;
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
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => searchSchema.parse(input))
  .handler(async ({ data, context }): Promise<AdminUserRow[]> => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const needle = data.email.toLowerCase();
    const { data: usersRes, error } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (error) throw new Error("APP-SYS-001: " + error.message);
    const matches = (usersRes.users ?? [])
      .filter((u) => (u.email ?? "").toLowerCase().includes(needle))
      .slice(0, 25);
    if (matches.length === 0) return [];

    const ids = matches.map((u) => u.id);
    const [{ data: profs }, { data: roles }, { data: recipes }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, first_name, last_name, is_premium").in("id", ids),
      supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", ids),
      supabaseAdmin
        .from("recipes")
        .select("user_id")
        .in("user_id", ids)
        .eq("is_official_melik", false),
    ]);

    const profMap = new Map((profs ?? []).map((p) => [p.id, p]));
    const adminSet = new Set(
      (roles ?? []).filter((r) => r.role === "admin").map((r) => r.user_id),
    );
    const countMap = new Map<string, number>();
    for (const r of recipes ?? []) {
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
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => reportSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Rate limit blando: máx 20 reportes por hora por usuario.
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await supabaseAdmin
      .from("error_reports")
      .select("*", { count: "exact", head: true })
      .eq("user_id", context.userId)
      .gte("created_at", oneHourAgo);
    if ((count ?? 0) >= 20) {
      throw new Error("APP-AUTH-004: too many reports");
    }

    const { error } = await context.supabase.from("error_reports").insert({
      user_id: context.userId,
      error_message: data.error_message,
      route: data.route || null,
      error_code: data.error_code || null,
    });
    if (error) throw new Error("APP-SYS-001: " + error.message);
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
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => sendNotifSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true; id: string }> => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("notifications")
      .insert({
        user_id: data.userId,
        title: data.title,
        message: data.message,
        type: data.type,
      })
      .select("id")
      .single();
    if (error) throw new Error("APP-SYS-001: " + error.message);
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
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<NotificationRow[]> => {
    const { data, error } = await context.supabase
      .from("notifications")
      .select("id, title, message, type, is_read, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error("APP-SYS-001: " + error.message);
    return (data ?? []) as NotificationRow[];
  });

const notifIdSchema = z.object({ id: z.string().uuid() });

export const markNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => notifIdSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error("APP-SYS-001: " + error.message);
    return { ok: true };
  });

export const deleteNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => notifIdSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase
      .from("notifications")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error("APP-SYS-001: " + error.message);
    return { ok: true };
  });

// Contador liviano para el badge de la campana. Head + count evita descargar filas.
export const getMyUnreadNotificationsCount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ count: number }> => {
    const { count, error } = await context.supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId)
      .eq("is_read", false);
    if (error) throw new Error("APP-SYS-001: " + error.message);
    return { count: count ?? 0 };
  });

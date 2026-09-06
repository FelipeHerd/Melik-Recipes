// Admin metrics — Tab 1 (Radar): stats, top consumers, error inbox, leads export.
// Every function is `requireSupabaseAuth` + `assertAdmin` gated.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

type Role = "user" | "admin" | "dev";

async function callerRole(userId: string): Promise<Role> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "dev"]);
  const roles = (data ?? []).map((r) => r.role);
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

async function audit(adminId: string, action: string, targetUserId: string | null, metadata: Record<string, unknown> = {}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("admin_audit_log").insert({
    admin_id: adminId,
    action,
    target_user_id: targetUserId,
    metadata: metadata as never,
  });
}

// ------------------------- KPIs ---------------------------------------------

export type AdminStatsV2 = {
  totalUsers: number;
  premiumActive: number;
  premiumTrials: number;
  totalRecipes: number;
  officialRecipes: number;
  kikoRequestsThisMonth: number;
  topKikoUsers: {
    userId: string;
    username: string | null;
    firstName: string | null;
    avatarUrl: string | null;
    requestCount: number;
  }[];
};

export const getAdminStatsV2 = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminStatsV2> => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const nowIso = new Date().toISOString();
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);

    const [
      totalUsersRes,
      premiumActiveRes,
      premiumTrialsRes,
      totalRecipesRes,
      officialRecipesRes,
      kikoMonthRes,
      topRes,
    ] = await Promise.all([
      supabaseAdmin.from("profiles").select("*", { count: "exact", head: true }),
      supabaseAdmin
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .or(`is_premium.eq.true,premium_until.gt.${nowIso}`),
      supabaseAdmin
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .eq("is_premium", false)
        .gt("premium_until", nowIso),
      supabaseAdmin
        .from("recipes")
        .select("*", { count: "exact", head: true })
        .eq("is_official_melik", false),
      supabaseAdmin
        .from("recipes")
        .select("*", { count: "exact", head: true })
        .eq("is_official_melik", true),
      supabaseAdmin
        .from("ai_usage")
        .select("*", { count: "exact", head: true })
        .gte("created_at", monthStart.toISOString()),
      context.supabase.rpc("admin_top_kiko_users", {
        _since: monthStart.toISOString(),
        _limit: 5,
      }),
    ]);

    const topRows = (topRes.data ?? []) as Array<{
      user_id: string;
      username: string | null;
      first_name: string | null;
      avatar_url: string | null;
      request_count: number;
    }>;

    return {
      totalUsers: totalUsersRes.count ?? 0,
      premiumActive: premiumActiveRes.count ?? 0,
      premiumTrials: premiumTrialsRes.count ?? 0,
      totalRecipes: totalRecipesRes.count ?? 0,
      officialRecipes: officialRecipesRes.count ?? 0,
      kikoRequestsThisMonth: kikoMonthRes.count ?? 0,
      topKikoUsers: topRows.map((r) => ({
        userId: r.user_id,
        username: r.username,
        firstName: r.first_name,
        avatarUrl: r.avatar_url,
        requestCount: Number(r.request_count) || 0,
      })),
    };
  });

// ------------------------- Error inbox --------------------------------------

export type OpenErrorRow = {
  id: string;
  code: string | null;
  message: string;
  route: string | null;
  createdAt: string;
  userId: string | null;
  username: string | null;
  email: string | null;
};

export const listOpenErrorReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<OpenErrorRow[]> => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("error_reports")
      .select("id, user_id, error_code, error_message, route, created_at")
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error("APP-SYS-001: " + error.message);
    const ids = Array.from(new Set((rows ?? []).map((r) => r.user_id).filter(Boolean))) as string[];
    const profileMap = new Map<string, { username: string | null }>();
    const emailMap = new Map<string, string | null>();
    if (ids.length) {
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id, username")
        .in("id", ids);
      (profs ?? []).forEach((p) => profileMap.set(p.id, { username: p.username }));
      const results = await Promise.all(
        ids.map((id) => supabaseAdmin.auth.admin.getUserById(id).catch(() => null)),
      );
      results.forEach((res, i) => {
        emailMap.set(ids[i], res?.data?.user?.email ?? null);
      });
    }
    return (rows ?? []).map((r) => ({
      id: r.id,
      code: r.error_code,
      message: r.error_message,
      route: r.route,
      createdAt: r.created_at,
      userId: r.user_id,
      username: r.user_id ? profileMap.get(r.user_id)?.username ?? null : null,
      email: r.user_id ? emailMap.get(r.user_id) ?? null : null,
    }));
  });

const resolveSchema = z.object({ id: z.string().uuid() });

export const resolveErrorReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => resolveSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("error_reports")
      .update({ status: "resolved" })
      .eq("id", data.id);
    if (error) throw new Error("APP-SYS-001: " + error.message);
    await audit(context.userId, "resolve_error", null, { report_id: data.id });
    return { ok: true };
  });

// ------------------------- Leads export -------------------------------------

export type LeadRow = {
  userId: string;
  email: string | null;
  username: string | null;
  createdAt: string;
  isPremium: boolean;
  premiumUntil: string | null;
};

export const exportLeadsCsv = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ rows: LeadRow[] }> => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Paginación completa: recorre TODAS las páginas hasta agotarlas.
    const all: { id: string; email: string | null; created_at: string }[] = [];
    let page = 1;
    const perPage = 200;
    const HARD_CAP = 100; // ~20k usuarios; guardia contra loops infinitos.
    while (page <= HARD_CAP) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
      if (error) throw new Error("APP-SYS-001: " + error.message);
      const users = data?.users ?? [];
      if (users.length === 0) break;
      for (const u of users) {
        all.push({ id: u.id, email: u.email ?? null, created_at: u.created_at });
      }
      if (users.length < perPage) break;
      page += 1;
    }

    // Join con profiles para username, is_premium, premium_until (en lotes de 500).
    const profileMap = new Map<string, { username: string | null; is_premium: boolean; premium_until: string | null }>();
    const ids = all.map((u) => u.id);
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id, username, is_premium, premium_until")
        .in("id", chunk);
      (profs ?? []).forEach((p) =>
        profileMap.set(p.id, {
          username: p.username,
          is_premium: !!p.is_premium,
          premium_until: p.premium_until,
        }),
      );
    }

    await audit(context.userId, "export_leads", null, { count: all.length });

    return {
      rows: all.map((u) => {
        const p = profileMap.get(u.id);
        return {
          userId: u.id,
          email: u.email,
          username: p?.username ?? null,
          createdAt: u.created_at,
          isPremium: !!p?.is_premium,
          premiumUntil: p?.premium_until ?? null,
        };
      }),
    };
  });

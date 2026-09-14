// Admin metrics — Tab 1 (Radar): stats, top consumers, error inbox, leads export.
// Every function is `requireAuth` + `assertAdmin` gated.
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

async function assertAdmin(userId: string) {
  const role = await callerRole(userId);
  if (role !== "admin") {
    throw new Error("APP-PERM-002: forbidden");
  }
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
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<AdminStatsV2> => {
    await assertAdmin(context.userId);
    const { db } = await import("@/lib/db.server");
    const { sql } = await import("kysely");
    const now = new Date();
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);

    const count = (qb: { executeTakeFirstOrThrow: () => Promise<{ count: number }> }) =>
      qb.executeTakeFirstOrThrow().then((r) => Number(r.count));

    const [
      totalUsers,
      premiumActive,
      premiumTrials,
      totalRecipes,
      officialRecipes,
      kikoThisMonth,
      topRows,
    ] = await Promise.all([
      count(db.selectFrom("profiles").select(sql<number>`count(*)`.as("count"))),
      count(
        db
          .selectFrom("profiles")
          .select(sql<number>`count(*)`.as("count"))
          .where((eb) => eb.or([eb("is_premium", "=", true), eb("premium_until", ">", now)])),
      ),
      count(
        db
          .selectFrom("profiles")
          .select(sql<number>`count(*)`.as("count"))
          .where("is_premium", "=", false)
          .where("premium_until", ">", now),
      ),
      count(
        db
          .selectFrom("recipes")
          .select(sql<number>`count(*)`.as("count"))
          .where("is_official_melik", "=", false),
      ),
      count(
        db
          .selectFrom("recipes")
          .select(sql<number>`count(*)`.as("count"))
          .where("is_official_melik", "=", true),
      ),
      count(
        db
          .selectFrom("ai_usage")
          .select(sql<number>`count(*)`.as("count"))
          .where("created_at", ">=", monthStart),
      ),
      // Replaces the old admin_top_kiko_users() SQL RPC with a plain query.
      db
        .selectFrom("ai_usage")
        .innerJoin("profiles", "profiles.id", "ai_usage.user_id")
        .select([
          "ai_usage.user_id",
          "profiles.username",
          "profiles.first_name",
          "profiles.avatar_url",
          sql<number>`count(*)`.as("request_count"),
        ])
        .where("ai_usage.created_at", ">=", monthStart)
        .groupBy([
          "ai_usage.user_id",
          "profiles.username",
          "profiles.first_name",
          "profiles.avatar_url",
        ])
        .orderBy(sql`count(*)`, "desc")
        .limit(5)
        .execute(),
    ]);

    return {
      totalUsers,
      premiumActive,
      premiumTrials,
      totalRecipes,
      officialRecipes,
      kikoRequestsThisMonth: kikoThisMonth,
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
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<OpenErrorRow[]> => {
    await assertAdmin(context.userId);
    const { db, isoOrNull } = await import("@/lib/db.server");
    const { getUserById } = await import("@/lib/auth/admin-users.server");

    const rows = await db
      .selectFrom("error_reports")
      .select(["id", "user_id", "error_code", "error_message", "route", "created_at"])
      .where("status", "=", "open")
      .orderBy("created_at", "desc")
      .limit(50)
      .execute();

    const ids = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean)));
    const profileMap = new Map<string, { username: string | null }>();
    const emailMap = new Map<string, string | null>();
    if (ids.length) {
      const profs = await db
        .selectFrom("profiles")
        .select(["id", "username"])
        .where("id", "in", ids)
        .execute();
      profs.forEach((p) => profileMap.set(p.id, { username: p.username }));
      const results = await Promise.all(ids.map((id) => getUserById(id)));
      results.forEach((res, i) => emailMap.set(ids[i], res?.email ?? null));
    }
    return rows.map((r) => ({
      id: r.id,
      code: r.error_code,
      message: r.error_message,
      route: r.route,
      createdAt: isoOrNull(r.created_at) as string,
      userId: r.user_id,
      username: r.user_id ? (profileMap.get(r.user_id)?.username ?? null) : null,
      email: r.user_id ? (emailMap.get(r.user_id) ?? null) : null,
    }));
  });

const resolveSchema = z.object({ id: z.string().uuid() });

export const resolveErrorReport = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => resolveSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertAdmin(context.userId);
    const { db } = await import("@/lib/db.server");
    await db
      .updateTable("error_reports")
      .set({ status: "resolved" })
      .where("id", "=", data.id)
      .execute();
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
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<{ rows: LeadRow[] }> => {
    await assertAdmin(context.userId);
    const { db, isoOrNull } = await import("@/lib/db.server");
    const { listAllUsers } = await import("@/lib/auth/admin-users.server");

    const all = await listAllUsers();

    // Join con profiles para username, is_premium, premium_until (en lotes de 500).
    const profileMap = new Map<
      string,
      { username: string | null; is_premium: boolean; premium_until: Date | null }
    >();
    const ids = all.map((u) => u.id);
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      const profs = await db
        .selectFrom("profiles")
        .select(["id", "username", "is_premium", "premium_until"])
        .where("id", "in", chunk)
        .execute();
      profs.forEach((p) =>
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
          createdAt: isoOrNull(u.created_at) as string,
          isPremium: !!p?.is_premium,
          premiumUntil: isoOrNull(p?.premium_until),
        };
      }),
    };
  });

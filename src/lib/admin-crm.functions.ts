// Admin CRM — Tab 2: search, block Kiko, grant trials, change role, impersonate.
// All calls: requireSupabaseAuth → assertAdmin (admin ONLY; dev is NOT admin)
// → supabaseAdmin (dynamic) → audit.
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
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("admin_audit_log").insert({
    admin_id: adminId,
    action,
    target_user_id: targetUserId,
    metadata: metadata as never,
  });
}

async function sendNotifInternal(
  userId: string,
  title: string,
  message: string,
  type: "system" | "kiko" | "melik_plus" | "admin",
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("notifications").insert({ user_id: userId, title, message, type });
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
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => searchSchema.parse(input))
  .handler(async ({ data, context }): Promise<AdminCrmRow[]> => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const q = data.q.trim();

    type AuthUser = { id: string; email: string | null; created_at: string };
    const matches: AuthUser[] = [];

    if (UUID_RE.test(q)) {
      const { data: res } = await supabaseAdmin.auth.admin.getUserById(q);
      if (res?.user) {
        matches.push({
          id: res.user.id,
          email: res.user.email ?? null,
          created_at: res.user.created_at,
        });
      }
    } else if (q.includes("@")) {
      const needle = q.toLowerCase();
      let page = 1;
      const perPage = 200;
      while (page <= 5 && matches.length < 25) {
        const { data: list, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
        if (error) break;
        const users = list?.users ?? [];
        if (!users.length) break;
        for (const u of users) {
          if ((u.email ?? "").toLowerCase().includes(needle)) {
            matches.push({ id: u.id, email: u.email ?? null, created_at: u.created_at });
            if (matches.length >= 25) break;
          }
        }
        if (users.length < perPage) break;
        page += 1;
      }
    } else {
      const needle = q.toLowerCase().replace(/[%_]/g, "");
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .ilike("username", `%${needle}%`)
        .limit(25);
      const ids = (profs ?? []).map((p) => p.id);
      const results = await Promise.all(
        ids.map((id) => supabaseAdmin.auth.admin.getUserById(id).catch(() => null)),
      );
      results.forEach((res) => {
        if (res?.data?.user) {
          matches.push({
            id: res.data.user.id,
            email: res.data.user.email ?? null,
            created_at: res.data.user.created_at,
          });
        }
      });
    }

    if (matches.length === 0) return [];

    const ids = matches.map((m) => m.id);
    const [{ data: profs }, { data: roles }] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select(
          "id, username, first_name, last_name, avatar_url, is_premium, premium_until, kiko_blocked_until, paid_months_total",
        )
        .in("id", ids),
      supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", ids),
    ]);

    const profMap = new Map((profs ?? []).map((p) => [p.id, p]));
    const roleMap = new Map<string, Role>();
    (roles ?? []).forEach((r) => {
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
        premiumUntil: p?.premium_until ?? null,
        kikoBlockedUntil: p?.kiko_blocked_until ?? null,
        createdAt: m.created_at,
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
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => kikoSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ kiko_blocked_until: data.until })
      .eq("id", data.userId);
    if (error) throw new Error("APP-SYS-001: " + error.message);

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
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => trialSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ premiumUntil: string | null }> => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.days === null) {
      const { error } = await supabaseAdmin
        .from("profiles")
        .update({ premium_until: null })
        .eq("id", data.userId);
      if (error) throw new Error("APP-SYS-001: " + error.message);
      await audit(context.userId, "trial_revoke", data.userId);
      return { premiumUntil: null };
    }

    // Nueva expiración = max(now, premium_until_actual) + days
    const { data: current } = await supabaseAdmin
      .from("profiles")
      .select("premium_until")
      .eq("id", data.userId)
      .maybeSingle();
    const nowMs = Date.now();
    const baseMs = current?.premium_until
      ? Math.max(nowMs, new Date(current.premium_until).getTime())
      : nowMs;
    const nextIso = new Date(baseMs + data.days * 86_400_000).toISOString();

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ premium_until: nextIso, trial_expiring_notified_for: null })
      .eq("id", data.userId);
    if (error) throw new Error("APP-SYS-001: " + error.message);

    const durationLabel =
      data.days === 1 ? "1 día" : data.days < 30 ? `${data.days} días` : data.days === 30 ? "1 mes" : `${data.days} días`;
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
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => roleSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertAdmin(context.userId);
    if (data.userId === context.userId) {
      throw new Error("APP-PERM-002: no puedes cambiar tu propio rol");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: prev } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", data.userId)
      .maybeSingle();
    const prevRole = (prev?.role ?? "user") as Role;

    // Last-admin guard: no permitas degradar al último admin.
    if (prevRole === "admin" && data.role !== "admin") {
      const { count } = await supabaseAdmin
        .from("user_roles")
        .select("*", { count: "exact", head: true })
        .eq("role", "admin");
      if ((count ?? 0) <= 1) {
        throw new Error("APP-PERM-003: no puedes dejar la app sin admins");
      }
    }

    // Escritura dual + normalización a exactamente un rol en `user_roles`.
    const { error: profErr } = await supabaseAdmin
      .from("profiles")
      .update({ role: data.role })
      .eq("id", data.userId);
    if (profErr) throw new Error("APP-SYS-001: " + profErr.message);

    const { error: delErr } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", data.userId);
    if (delErr) throw new Error("APP-SYS-001: " + delErr.message);

    if (data.role !== "user") {
      const { error: insErr } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: data.userId, role: data.role });
      if (insErr) throw new Error("APP-SYS-001: " + insErr.message);
    }

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

const impersonateSchema = z.object({ userId: z.string().uuid() });

export const generateImpersonationLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => impersonateSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ actionLink: string; email: string }> => {
    await assertAdmin(context.userId); // solo admin.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: userRes, error: getErr } = await supabaseAdmin.auth.admin.getUserById(data.userId);
    if (getErr || !userRes?.user?.email) {
      throw new Error("APP-ADMIN-001: usuario sin correo válido");
    }
    const email = userRes.user.email;
    const { data: linkRes, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (linkErr || !linkRes?.properties?.action_link) {
      throw new Error("APP-ADMIN-001: " + (linkErr?.message ?? "no link"));
    }
    await audit(context.userId, "impersonate", data.userId, { email });
    return { actionLink: linkRes.properties.action_link, email };
  });

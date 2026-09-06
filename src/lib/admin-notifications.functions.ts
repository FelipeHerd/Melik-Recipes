// Admin notifications — send real notifications to selected users.
// Security posture:
//   - requireSupabaseAuth + assertAdmin in every handler.
//   - `type` restricted by role: admin/system solo admin; dev solo melik_plus/kiko.
//   - Client sends userIds[] resueltos previamente — nunca segmento en el `send`.
//   - Sanitización server-side + whitelist de dominios en mensajes con URL.
//   - Cap duro 2.000 destinatarios por batch, rate-limit por admin/hora y día.
//   - batch_id + audit log previo (`pending`) permite reintento idempotente.
//   - Segmento "all" y broadcast a admins/devs bloqueados salvo modo especial.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  TEMPLATES,
  findTemplate,
  type NotifTemplate,
  type NotifTemplateId,
  type NotifType,
} from "./notification-templates";

type Role = "user" | "admin" | "dev";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const HARD_CAP = 2000; // por envío
const RATE_LIMIT_HOUR_BROADCASTS = 3; // envíos > 50 dst por hora
const RATE_LIMIT_HOUR_THRESHOLD = 50;
const RATE_LIMIT_DAY_TOTAL = 10_000; // notificaciones totales / admin / día
const BATCH_INSERT_SIZE = 250;
const CONFIRM_STEPUP_THRESHOLD = 100;

// Solo se permiten URLs que apunten a dominios propios.
const NOTIF_URL_WHITELIST = new Set<string>([
  "melik-recipes.lovable.app",
  "melikbakery.com",
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
    throw new Error("APP-PERM-002: No tienes permisos administrativos.");
  }
  return role;
}

function sanitizeText(input: string, maxLen: number, label: string): string {
  const s = input.trim();
  if (s.length === 0) throw new Error(`APP-VAL-001: ${label} no puede estar vacío.`);
  if (s.length > maxLen)
    throw new Error(`APP-VAL-001: ${label} excede ${maxLen} caracteres.`);
  // Rechazo de HTML / control chars / backticks (evita phishing con inline HTML
  // si algún renderer futuro se equivoca).
  // eslint-disable-next-line no-control-regex
  if (/[<>`\u0000-\u0008\u000b-\u001f]/.test(s)) {
    throw new Error(`APP-VAL-002: ${label} contiene caracteres no permitidos.`);
  }
  return s;
}

function assertUrlsWhitelisted(text: string, label: string): void {
  const urlRe = /https?:\/\/([^\s)/"'<>]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = urlRe.exec(text)) !== null) {
    const host = m[1]!.split("/")[0]!.toLowerCase().replace(/^www\./, "");
    if (!NOTIF_URL_WHITELIST.has(host)) {
      throw new Error(
        `APP-VAL-003: ${label} contiene un enlace a un dominio no permitido (${host}).`,
      );
    }
  }
}

function renderForRecipient(
  template: NotifTemplate,
  customOverride: { title?: string; message?: string } | null,
  profile: { first_name: string | null; username: string | null } | undefined,
  ctx: Record<string, string>,
): { title: string; message: string } {
  const rawTitle = customOverride?.title ?? template.title;
  const rawMessage = customOverride?.message ?? template.message;
  const nombre =
    (profile?.first_name?.trim() || profile?.username?.trim() || "hola").trim();

  const substitute = (s: string): string => {
    // {nombre} y {ctx.KEY}
    let out = s.replace(/\{nombre\}/g, nombre);
    out = out.replace(/\{ctx\.([a-z0-9_]+)\}/gi, (_full, key: string) => {
      const val = ctx[key];
      if (val === undefined || val === null || val === "") {
        throw new Error(`APP-VAL-004: Falta valor para {ctx.${key}}.`);
      }
      return String(val);
    });
    // Placeholder no resuelto = error explícito por-usuario.
    if (/\{[a-z0-9_.]+\}/i.test(out)) {
      const missing = out.match(/\{[a-z0-9_.]+\}/i)?.[0] ?? "?";
      throw new Error(`APP-VAL-005: Placeholder sin resolver: ${missing}`);
    }
    return out;
  };

  return { title: substitute(rawTitle), message: substitute(rawMessage) };
}

// ---------------------------------------------------------------------------
// Segments
// ---------------------------------------------------------------------------

const SEGMENTS = [
  "all",
  "melik_plus_active",
  "free",
  "trial_active",
  "kiko_blocked",
  "admins_devs",
] as const;
type Segment = (typeof SEGMENTS)[number];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveSegment(
  segment: Segment,
  callerRoleName: Role,
): Promise<string[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // "all" y "admins_devs" solo admin.
  if ((segment === "all" || segment === "admins_devs") && callerRoleName !== "admin") {
    throw new Error("APP-PERM-002: Este segmento solo puede resolverlo un admin.");
  }

  const nowIso = new Date().toISOString();
  const q = supabaseAdmin.from("profiles").select("id").limit(HARD_CAP + 1);

  let rows: { id: string }[] = [];
  if (segment === "all") {
    const { data } = await q;
    rows = data ?? [];
  } else if (segment === "melik_plus_active") {
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("id, premium_until, is_premium")
      .eq("is_premium", true)
      .limit(HARD_CAP + 1);
    rows = (data ?? []).filter(
      (p) => !p.premium_until || new Date(p.premium_until).getTime() > Date.now(),
    );
  } else if (segment === "free") {
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("is_premium", false)
      .limit(HARD_CAP + 1);
    rows = data ?? [];
  } else if (segment === "trial_active") {
    // Trial = premium_until en el futuro y subscription_status != 'active'
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("id, premium_until, subscription_status")
      .gt("premium_until", nowIso)
      .neq("subscription_status", "active")
      .limit(HARD_CAP + 1);
    rows = data ?? [];
  } else if (segment === "kiko_blocked") {
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("id, kiko_blocked_until")
      .gt("kiko_blocked_until", nowIso)
      .limit(HARD_CAP + 1);
    rows = data ?? [];
  } else if (segment === "admins_devs") {
    const { data } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .in("role", ["admin", "dev"]);
    rows = (data ?? []).map((r) => ({ id: r.user_id }));
  }

  // Exclusión de admins/devs salvo modo especial.
  if (segment !== "admins_devs") {
    const { data: privileged } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .in("role", ["admin", "dev"]);
    const priv = new Set((privileged ?? []).map((r) => r.user_id));
    rows = rows.filter((r) => !priv.has(r.id));
  }

  // Dedup y cap.
  const uniq = Array.from(new Set(rows.map((r) => r.id)));
  return uniq;
}

// ---------------------------------------------------------------------------
// Public helpers (templates catalog for the UI)
// ---------------------------------------------------------------------------

export const listNotificationTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    return TEMPLATES.map((t) => ({
      id: t.id,
      label: t.label,
      type: t.type,
      title: t.title,
      message: t.message,
      requiredContext: t.requiredContext,
      isAuto: t.isAuto,
      description: t.description,
    }));
  });

// ---------------------------------------------------------------------------
// Resolve targets
// ---------------------------------------------------------------------------

const resolveSchema = z.object({
  mode: z.enum(["users", "segment", "uuids"]),
  userIds: z.array(z.string().uuid()).max(HARD_CAP + 1).optional(),
  segment: z.enum(SEGMENTS).optional(),
  uuidsText: z.string().max(200_000).optional(),
});

export const resolveNotificationTargets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => resolveSchema.parse(input))
  .handler(async ({ data, context }) => {
    const role = await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let ids: string[] = [];
    let invalid: string[] = [];

    if (data.mode === "users") {
      ids = Array.from(new Set(data.userIds ?? []));
    } else if (data.mode === "segment") {
      if (!data.segment) throw new Error("APP-VAL-006: segment requerido.");
      ids = await resolveSegment(data.segment, role);
    } else if (data.mode === "uuids") {
      const lines = (data.uuidsText ?? "")
        .split(/[\s,;]+/)
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 2000);
      const seen = new Set<string>();
      for (const l of lines) {
        if (UUID_RE.test(l)) {
          if (!seen.has(l.toLowerCase())) {
            seen.add(l.toLowerCase());
            ids.push(l);
          }
        } else invalid.push(l);
      }
      // Exclusión de admins/devs.
      if (ids.length > 0) {
        const { data: privileged } = await supabaseAdmin
          .from("user_roles")
          .select("user_id")
          .in("user_id", ids)
          .in("role", ["admin", "dev"]);
        const priv = new Set((privileged ?? []).map((r) => r.user_id));
        ids = ids.filter((id) => !priv.has(id));
      }
      // Solo IDs que existen en profiles.
      if (ids.length > 0) {
        const { data: profs } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .in("id", ids);
        const real = new Set((profs ?? []).map((p) => p.id));
        invalid = invalid.concat(ids.filter((id) => !real.has(id)));
        ids = ids.filter((id) => real.has(id));
      }
    }

    // Audit de resolución masiva (útil para forense).
    if (ids.length > 100 || data.mode === "segment") {
      await supabaseAdmin.from("admin_audit_log").insert({
        admin_id: context.userId,
        action: "notification_segment_resolve",
        target_user_id: null,
        metadata: {
          mode: data.mode,
          segment: data.segment ?? null,
          count: ids.length,
        } as never,
      });
    }

    // Sample de 5 con username/avatar — NUNCA email.
    let sample: {
      id: string;
      username: string | null;
      avatarUrl: string | null;
      firstName: string | null;
    }[] = [];
    if (ids.length > 0) {
      const { data: sampleData } = await supabaseAdmin
        .from("profiles")
        .select("id, username, avatar_url, first_name")
        .in("id", ids.slice(0, 5));
      sample = (sampleData ?? []).map((p) => ({
        id: p.id,
        username: p.username,
        avatarUrl: p.avatar_url,
        firstName: p.first_name,
      }));
    }

    return {
      userIds: ids,
      count: ids.length,
      invalid,
      sample,
      overLimit: ids.length > HARD_CAP,
    };
  });

// ---------------------------------------------------------------------------
// Send notification
// ---------------------------------------------------------------------------

const sendSchema = z.object({
  userIds: z.array(z.string().uuid()).min(1).max(HARD_CAP),
  templateId: z.enum([
    "custom",
    "welcome_plus_monthly",
    "welcome_plus_yearly",
    "plus_renewed",
    "plus_ended",
    "trial_expiring",
    "trial_gift",
    "kiko_blocked",
    "kiko_unblocked",
    "role_promoted",
    "system_announcement",
  ]),
  // Solo se leen cuando templateId === 'custom'.
  customTitle: z.string().min(3).max(120).optional(),
  customMessage: z.string().min(3).max(500).optional(),
  customType: z.enum(["system", "kiko", "melik_plus", "admin"]).optional(),
  ctx: z.record(z.string(), z.string().max(200)).optional(),
  retryBatchId: z.string().uuid().optional(),
  password: z.string().min(1, "Falta contraseña").max(200),
});

export type SendNotificationResult = {
  batchId: string;
  inserted: number;
  failed: { userId: string; reason: string }[];
  status: "ok" | "partial" | "failed";
};

async function checkRateLimit(adminId: string, targetsCount: number): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: hourAudits } = await supabaseAdmin
    .from("admin_audit_log")
    .select("metadata, created_at")
    .eq("admin_id", adminId)
    .eq("action", "notification_send")
    .gte("created_at", oneHourAgo);

  const broadcastsThisHour = (hourAudits ?? []).filter((a) => {
    const c = Number((a.metadata as { targets_count?: number } | null)?.targets_count ?? 0);
    return c > RATE_LIMIT_HOUR_THRESHOLD;
  }).length;
  if (targetsCount > RATE_LIMIT_HOUR_THRESHOLD && broadcastsThisHour >= RATE_LIMIT_HOUR_BROADCASTS) {
    throw new Error(
      "APP-RATE-001: Límite alcanzado — máx. 3 broadcasts (>50 dst) por hora.",
    );
  }

  const { data: dayAudits } = await supabaseAdmin
    .from("admin_audit_log")
    .select("metadata")
    .eq("admin_id", adminId)
    .eq("action", "notification_send")
    .gte("created_at", oneDayAgo);
  const sentToday = (dayAudits ?? []).reduce(
    (acc, a) =>
      acc +
      Number((a.metadata as { inserted?: number } | null)?.inserted ?? 0),
    0,
  );
  if (sentToday + targetsCount > RATE_LIMIT_DAY_TOTAL) {
    throw new Error(
      `APP-RATE-002: Límite diario alcanzado (${RATE_LIMIT_DAY_TOTAL} notif./día).`,
    );
  }
}

// ---------------------------------------------------------------------------
// Step-up (contraseña admin, verificada server-side)
// ---------------------------------------------------------------------------

const STEPUP_FAIL_WINDOW_MS = 15 * 60 * 1000;
const STEPUP_FAIL_MAX = 5;

async function verifyAdminPasswordOrThrow(
  adminId: string,
  password: string,
): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Rate-limit anti fuerza bruta por admin (últimos 15 min).
  const since = new Date(Date.now() - STEPUP_FAIL_WINDOW_MS).toISOString();
  const { data: fails } = await supabaseAdmin
    .from("admin_audit_log")
    .select("id")
    .eq("admin_id", adminId)
    .eq("action", "notification_stepup_fail")
    .gte("created_at", since);
  if ((fails?.length ?? 0) >= STEPUP_FAIL_MAX) {
    throw new Error(
      "APP-PERM-005: Demasiados intentos fallidos. Espera 15 minutos.",
    );
  }

  // Obtener email del admin desde Auth.
  const { data: userRes, error: getErr } =
    await supabaseAdmin.auth.admin.getUserById(adminId);
  const email = userRes?.user?.email;
  if (getErr || !email) {
    throw new Error("APP-PERM-004: No se pudo verificar tu identidad.");
  }

  // Cliente Supabase server-only, sin persistencia — no toca la sesión activa.
  const url = process.env.SUPABASE_URL;
  const publishable = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishable) {
    throw new Error("APP-SRV-001: Configuración de auth no disponible.");
  }
  const verifier = createClient(url, publishable, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (publishable.startsWith("sb_") && h.get("Authorization") === `Bearer ${publishable}`) {
          h.delete("Authorization");
        }
        h.set("apikey", publishable);
        return fetch(input, { ...init, headers: h });
      },
    },
  });

  const { error: signErr } = await verifier.auth.signInWithPassword({
    email,
    password,
  });
  if (signErr) {
    await supabaseAdmin.from("admin_audit_log").insert({
      admin_id: adminId,
      action: "notification_stepup_fail",
      metadata: {},
    });
    throw new Error(
      "APP-PERM-004: Contraseña incorrecta. Vuelve a intentarlo.",
    );
  }

  // Cierra la sesión efímera para no dejar refresh tokens huérfanos.
  try {
    await verifier.auth.signOut();
  } catch {
    // no-op
  }

  await supabaseAdmin.from("admin_audit_log").insert({
    admin_id: adminId,
    action: "notification_stepup_ok",
    metadata: {},
  });
}

export const sendAdminNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => sendSchema.parse(input))
  .handler(async ({ data, context }): Promise<SendNotificationResult> => {
    const role = await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Resolver plantilla y tipo efectivo.
    const template = findTemplate(data.templateId);
    if (!template) throw new Error("APP-VAL-007: Plantilla desconocida.");

    const effectiveType: NotifType =
      data.templateId === "custom" ? (data.customType ?? "system") : template.type;

    // Restricción por rol: admin/system solo admin.
    if ((effectiveType === "admin" || effectiveType === "system") && role !== "admin") {
      throw new Error(
        "APP-PERM-003: Solo un admin puede enviar notificaciones de tipo 'admin' o 'system'.",
      );
    }

    // Override title/message solo para 'custom'; validar y sanitizar.
    let customOverride: { title: string; message: string } | null = null;
    if (data.templateId === "custom") {
      if (!data.customTitle || !data.customMessage) {
        throw new Error("APP-VAL-008: Falta título o mensaje personalizado.");
      }
      const title = sanitizeText(data.customTitle, 120, "Título");
      const message = sanitizeText(data.customMessage, 500, "Mensaje");
      assertUrlsWhitelisted(title, "Título");
      assertUrlsWhitelisted(message, "Mensaje");
      customOverride = { title, message };
    } else {
      // Para plantillas, aún validamos el ctx.
      const missing = template.requiredContext.filter(
        (k) => !data.ctx || !data.ctx[k] || data.ctx[k]!.trim() === "",
      );
      if (missing.length > 0) {
        throw new Error(
          `APP-VAL-009: Faltan valores de contexto: ${missing.join(", ")}.`,
        );
      }
      for (const key of Object.keys(data.ctx ?? {})) {
        sanitizeText(data.ctx![key]!, 200, `ctx.${key}`);
        assertUrlsWhitelisted(data.ctx![key]!, `ctx.${key}`);
      }
    }

    // Dedup + cap final.
    const uniqIds = Array.from(new Set(data.userIds));
    if (uniqIds.length === 0) throw new Error("APP-VAL-010: Sin destinatarios.");
    if (uniqIds.length > HARD_CAP) {
      throw new Error(
        `APP-VAL-011: Cap ${HARD_CAP} destinatarios. Segmenta el envío.`,
      );
    }

    // Step-up: SIEMPRE exigimos que el admin re-confirme su contraseña,
    // verificada del lado servidor. Trust-nothing: no aceptamos flags booleanos
    // que puedan ser falsificados por un cliente adverso.
    await verifyAdminPasswordOrThrow(context.userId, data.password);



    // Rate-limit final.
    await checkRateLimit(context.userId, uniqIds.length);

    // El admin selecciona destinatarios explícitamente por ID desde la UI,
    // así que respetamos su intención — no se excluyen admins/devs.
    const filteredIds = uniqIds;

    // ------ Batch id + audit `pending` ------
    let batchId = data.retryBatchId ?? crypto.randomUUID();
    let toInsertIds = filteredIds;
    if (data.retryBatchId) {
      // Reintento: leer failedIds previos y sólo esos.
      const { data: prev } = await supabaseAdmin
        .from("admin_audit_log")
        .select("id, admin_id, metadata")
        .eq("action", "notification_send")
        .filter("metadata->>batch_id", "eq", data.retryBatchId)
        .maybeSingle();
      if (!prev || prev.admin_id !== context.userId) {
        throw new Error("APP-VAL-013: Reintento inválido.");
      }
      const failed =
        ((prev.metadata as { failed_ids?: string[] } | null)?.failed_ids ?? []) as string[];
      toInsertIds = failed.filter((id) => uniqIds.includes(id));
      if (toInsertIds.length === 0) {
        throw new Error("APP-VAL-014: No hay fallos a reintentar en ese batch.");
      }
      batchId = data.retryBatchId;
    }

    const auditPreInsert = await supabaseAdmin
      .from("admin_audit_log")
      .insert({
        admin_id: context.userId,
        action: "notification_send",
        target_user_id: null,
        metadata: {
          batch_id: batchId,
          status: "pending",
          template_id: data.templateId,
          type: effectiveType,
          custom: data.templateId === "custom",
          targets_count: toInsertIds.length,
          started_at: new Date().toISOString(),
          retry_of: data.retryBatchId ?? null,
          title_preview: (customOverride?.title ?? template.title).slice(0, 120),
        } as never,
      })
      .select("id")
      .single();

    if (auditPreInsert.error || !auditPreInsert.data) {
      throw new Error(
        "APP-SYS-001: No se pudo registrar el envío. Reintenta.",
      );
    }
    const auditRowId = auditPreInsert.data.id;

    // ------ Fetch de perfiles para render ------
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, first_name, username")
      .in("id", toInsertIds);
    const profileMap = new Map(
      (profiles ?? []).map((p) => [p.id, p]),
    );

    // ------ Render + insert por lotes ------
    let inserted = 0;
    const failed: { userId: string; reason: string }[] = [];

    for (let i = 0; i < toInsertIds.length; i += BATCH_INSERT_SIZE) {
      const chunk = toInsertIds.slice(i, i + BATCH_INSERT_SIZE);
      const rows: {
        user_id: string;
        title: string;
        message: string;
        type: NotifType;
      }[] = [];

      for (const id of chunk) {
        try {
          const rendered = renderForRecipient(
            template,
            customOverride,
            profileMap.get(id),
            data.ctx ?? {},
          );
          // Doble check post-render por si un placeholder introdujo texto sucio.
          sanitizeText(rendered.title, 120, "Título");
          sanitizeText(rendered.message, 500, "Mensaje");
          assertUrlsWhitelisted(rendered.title, "Título");
          assertUrlsWhitelisted(rendered.message, "Mensaje");
          rows.push({
            user_id: id,
            title: rendered.title,
            message: rendered.message,
            type: effectiveType,
          });
        } catch (e) {
          failed.push({
            userId: id,
            reason: e instanceof Error ? e.message : "unknown",
          });
        }
      }

      if (rows.length === 0) continue;
      const { error } = await supabaseAdmin.from("notifications").insert(rows);
      if (error) {
        for (const r of rows) {
          failed.push({ userId: r.user_id, reason: error.message });
        }
      } else {
        inserted += rows.length;
      }
    }

    const status: SendNotificationResult["status"] =
      failed.length === 0 ? "ok" : inserted === 0 ? "failed" : "partial";

    // ------ Update audit con resultado ------
    await supabaseAdmin
      .from("admin_audit_log")
      .update({
        metadata: {
          batch_id: batchId,
          status,
          template_id: data.templateId,
          type: effectiveType,
          custom: data.templateId === "custom",
          targets_count: toInsertIds.length,
          inserted,
          failed_count: failed.length,
          failed_ids: failed.map((f) => f.userId).slice(0, 500),
          retry_of: data.retryBatchId ?? null,
          finished_at: new Date().toISOString(),
          title_preview: (customOverride?.title ?? template.title).slice(0, 120),
        } as never,
      })
      .eq("id", auditRowId);

    return { batchId, inserted, failed, status };
  });

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

export type NotificationHistoryRow = {
  auditId: string;
  batchId: string | null;
  adminId: string;
  adminUsername: string | null;
  adminFirstName: string | null;
  createdAt: string;
  templateId: string | null;
  type: string | null;
  custom: boolean;
  targetsCount: number;
  inserted: number;
  failedCount: number;
  status: string;
  titlePreview: string | null;
};

const historySchema = z.object({
  limit: z.number().int().min(1).max(100).optional(),
});

export const listNotificationHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => historySchema.parse(input))
  .handler(async ({ data, context }): Promise<NotificationHistoryRow[]> => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const limit = data.limit ?? 50;

    const { data: rows } = await supabaseAdmin
      .from("admin_audit_log")
      .select("id, admin_id, metadata, created_at")
      .eq("action", "notification_send")
      .order("created_at", { ascending: false })
      .limit(limit);

    const adminIds = Array.from(
      new Set((rows ?? []).map((r) => r.admin_id).filter(Boolean) as string[]),
    );
    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("id, username, first_name")
      .in("id", adminIds);
    const profMap = new Map(
      (profs ?? []).map((p) => [p.id, p]),
    );

    return (rows ?? []).map((r) => {
      const m = (r.metadata ?? {}) as Record<string, unknown>;
      const p = profMap.get(r.admin_id);
      return {
        auditId: r.id,
        batchId: (m.batch_id as string) ?? null,
        adminId: r.admin_id,
        adminUsername: p?.username ?? null,
        adminFirstName: p?.first_name ?? null,
        createdAt: r.created_at,
        templateId: (m.template_id as string) ?? null,
        type: (m.type as string) ?? null,
        custom: (m.custom as boolean) ?? false,
        targetsCount: Number(m.targets_count ?? 0),
        inserted: Number(m.inserted ?? 0),
        failedCount: Number(m.failed_count ?? 0),
        status: (m.status as string) ?? "unknown",
        titlePreview: (m.title_preview as string) ?? null,
      };
    });
  });

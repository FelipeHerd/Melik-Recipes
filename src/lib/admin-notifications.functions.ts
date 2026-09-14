// Admin notifications — send real notifications to selected users.
// Security posture:
//   - requireAuth + assertAdmin in every handler.
//   - `type` restricted by role: admin/system solo admin; dev solo melik_plus/kiko.
//   - Client sends userIds[] resueltos previamente — nunca segmento en el `send`.
//   - Sanitizacion server-side + whitelist de dominios en mensajes con URL.
//   - Cap duro 2.000 destinatarios por batch, rate-limit por admin/hora y dia.
//   - batch_id + audit log previo (`pending`) permite reintento idempotente.
//   - Segmento "all" y broadcast a admins/devs bloqueados salvo modo especial.
import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "@/lib/auth/require-auth";
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

const HARD_CAP = 2000; // por envio
const RATE_LIMIT_HOUR_BROADCASTS = 3; // envios > 50 dst por hora
const RATE_LIMIT_HOUR_THRESHOLD = 50;
const RATE_LIMIT_DAY_TOTAL = 10_000; // notificaciones totales / admin / dia
const BATCH_INSERT_SIZE = 250;

// Solo se permiten URLs que apunten a dominios propios. APP_DOMAIN replaces
// the old Lovable-hosted domain — set it to wherever this app is deployed.
// Read per-call (not at module scope) per TanStack Start's env-access rules.
function notifUrlWhitelist(): Set<string> {
  return new Set([process.env.APP_DOMAIN, "melikbakery.com"].filter((d): d is string => !!d));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
    throw new Error("APP-PERM-002: No tienes permisos administrativos.");
  }
  return role;
}

// Rejects HTML angle brackets, backticks, and C0 control characters other
// than tab/newline/CR. Checked by char code (not a regex control-char
// class) to avoid embedding literal control bytes in this source file.
function hasDisallowedChars(s: string): boolean {
  if (/[<>`]/.test(s)) return true;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c <= 8 || (c >= 11 && c <= 31)) return true;
  }
  return false;
}

function sanitizeText(input: string, maxLen: number, label: string): string {
  const s = input.trim();
  if (s.length === 0) throw new Error(`APP-VAL-001: ${label} no puede estar vacio.`);
  if (s.length > maxLen) throw new Error(`APP-VAL-001: ${label} excede ${maxLen} caracteres.`);
  // Rechazo de HTML / control chars / backticks (evita phishing con inline HTML
  // si algun renderer futuro se equivoca).
  if (hasDisallowedChars(s)) {
    throw new Error(`APP-VAL-002: ${label} contiene caracteres no permitidos.`);
  }
  return s;
}

function assertUrlsWhitelisted(text: string, label: string): void {
  const urlRe = /https?:\/\/([^\s)/"'<>]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = urlRe.exec(text)) !== null) {
    const host = m[1]!
      .split("/")[0]!
      .toLowerCase()
      .replace(/^www\./, "");
    if (!notifUrlWhitelist().has(host)) {
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
  const nombre = (profile?.first_name?.trim() || profile?.username?.trim() || "hola").trim();

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
    // Placeholder no resuelto = error explicito por-usuario.
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveSegment(segment: Segment, callerRoleName: Role): Promise<string[]> {
  const { db } = await import("@/lib/db.server");

  // "all" y "admins_devs" solo admin.
  if ((segment === "all" || segment === "admins_devs") && callerRoleName !== "admin") {
    throw new Error("APP-PERM-002: Este segmento solo puede resolverlo un admin.");
  }

  const now = new Date();
  let rows: { id: string }[] = [];
  if (segment === "all") {
    rows = await db
      .selectFrom("profiles")
      .select(["id"])
      .limit(HARD_CAP + 1)
      .execute();
  } else if (segment === "melik_plus_active") {
    const data = await db
      .selectFrom("profiles")
      .select(["id", "premium_until", "is_premium"])
      .where("is_premium", "=", true)
      .limit(HARD_CAP + 1)
      .execute();
    rows = data.filter((p) => !p.premium_until || new Date(p.premium_until).getTime() > Date.now());
  } else if (segment === "free") {
    rows = await db
      .selectFrom("profiles")
      .select(["id"])
      .where("is_premium", "=", false)
      .limit(HARD_CAP + 1)
      .execute();
  } else if (segment === "trial_active") {
    // Trial = premium_until en el futuro y subscription_status != 'active'
    rows = await db
      .selectFrom("profiles")
      .select(["id"])
      .where("premium_until", ">", now)
      .where("subscription_status", "!=", "active")
      .limit(HARD_CAP + 1)
      .execute();
  } else if (segment === "kiko_blocked") {
    rows = await db
      .selectFrom("profiles")
      .select(["id"])
      .where("kiko_blocked_until", ">", now)
      .limit(HARD_CAP + 1)
      .execute();
  } else if (segment === "admins_devs") {
    const data = await db
      .selectFrom("user_roles")
      .select(["user_id"])
      .where("role", "in", ["admin", "dev"])
      .execute();
    rows = data.map((r) => ({ id: r.user_id }));
  }

  // Exclusion de admins/devs salvo modo especial.
  if (segment !== "admins_devs") {
    const privileged = await db
      .selectFrom("user_roles")
      .select(["user_id"])
      .where("role", "in", ["admin", "dev"])
      .execute();
    const priv = new Set(privileged.map((r) => r.user_id));
    rows = rows.filter((r) => !priv.has(r.id));
  }

  // Dedup y cap.
  return Array.from(new Set(rows.map((r) => r.id)));
}

// ---------------------------------------------------------------------------
// Public helpers (templates catalog for the UI)
// ---------------------------------------------------------------------------

export const listNotificationTemplates = createServerFn({ method: "GET" })
  .middleware([requireAuth])
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
  userIds: z
    .array(z.string().uuid())
    .max(HARD_CAP + 1)
    .optional(),
  segment: z.enum(SEGMENTS).optional(),
  uuidsText: z.string().max(200_000).optional(),
});

export const resolveNotificationTargets = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => resolveSchema.parse(input))
  .handler(async ({ data, context }) => {
    const role = await assertAdmin(context.userId);
    const { db, toJsonb } = await import("@/lib/db.server");

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
      // Exclusion de admins/devs.
      if (ids.length > 0) {
        const privileged = await db
          .selectFrom("user_roles")
          .select(["user_id"])
          .where("user_id", "in", ids)
          .where("role", "in", ["admin", "dev"])
          .execute();
        const priv = new Set(privileged.map((r) => r.user_id));
        ids = ids.filter((id) => !priv.has(id));
      }
      // Solo IDs que existen en profiles.
      if (ids.length > 0) {
        const profs = await db
          .selectFrom("profiles")
          .select(["id"])
          .where("id", "in", ids)
          .execute();
        const real = new Set(profs.map((p) => p.id));
        invalid = invalid.concat(ids.filter((id) => !real.has(id)));
        ids = ids.filter((id) => real.has(id));
      }
    }

    // Audit de resolucion masiva (util para forense).
    if (ids.length > 100 || data.mode === "segment") {
      await db
        .insertInto("admin_audit_log")
        .values({
          admin_id: context.userId,
          action: "notification_segment_resolve",
          target_user_id: null,
          metadata: toJsonb({ mode: data.mode, segment: data.segment ?? null, count: ids.length }),
        })
        .execute();
    }

    // Sample de 5 con username/avatar - NUNCA email.
    let sample: {
      id: string;
      username: string | null;
      avatarUrl: string | null;
      firstName: string | null;
    }[] = [];
    if (ids.length > 0) {
      const sampleData = await db
        .selectFrom("profiles")
        .select(["id", "username", "avatar_url", "first_name"])
        .where("id", "in", ids.slice(0, 5))
        .execute();
      sample = sampleData.map((p) => ({
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
  password: z.string().min(1, "Falta contrasena").max(200),
});

export type SendNotificationResult = {
  batchId: string;
  inserted: number;
  failed: { userId: string; reason: string }[];
  status: "ok" | "partial" | "failed";
};

async function checkRateLimit(adminId: string, targetsCount: number): Promise<void> {
  const { db } = await import("@/lib/db.server");
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const hourAudits = await db
    .selectFrom("admin_audit_log")
    .select(["metadata", "created_at"])
    .where("admin_id", "=", adminId)
    .where("action", "=", "notification_send")
    .where("created_at", ">=", oneHourAgo)
    .execute();

  const broadcastsThisHour = hourAudits.filter((a) => {
    const c = Number((a.metadata as { targets_count?: number } | null)?.targets_count ?? 0);
    return c > RATE_LIMIT_HOUR_THRESHOLD;
  }).length;
  if (
    targetsCount > RATE_LIMIT_HOUR_THRESHOLD &&
    broadcastsThisHour >= RATE_LIMIT_HOUR_BROADCASTS
  ) {
    throw new Error("APP-RATE-001: Limite alcanzado - max. 3 broadcasts (>50 dst) por hora.");
  }

  const dayAudits = await db
    .selectFrom("admin_audit_log")
    .select(["metadata"])
    .where("admin_id", "=", adminId)
    .where("action", "=", "notification_send")
    .where("created_at", ">=", oneDayAgo)
    .execute();
  const sentToday = dayAudits.reduce(
    (acc, a) => acc + Number((a.metadata as { inserted?: number } | null)?.inserted ?? 0),
    0,
  );
  if (sentToday + targetsCount > RATE_LIMIT_DAY_TOTAL) {
    throw new Error(`APP-RATE-002: Limite diario alcanzado (${RATE_LIMIT_DAY_TOTAL} notif./dia).`);
  }
}

// ---------------------------------------------------------------------------
// Step-up (contrasena admin, verificada server-side)
// ---------------------------------------------------------------------------

const STEPUP_FAIL_WINDOW_MS = 15 * 60 * 1000;
const STEPUP_FAIL_MAX = 5;

async function verifyAdminPasswordOrThrow(adminId: string, password: string): Promise<void> {
  const { db, toJsonb } = await import("@/lib/db.server");
  const { comparePassword } = await import("@/lib/auth/password.server");

  // Rate-limit anti fuerza bruta por admin (ultimos 15 min).
  const since = new Date(Date.now() - STEPUP_FAIL_WINDOW_MS);
  const fails = await db
    .selectFrom("admin_audit_log")
    .select(["id"])
    .where("admin_id", "=", adminId)
    .where("action", "=", "notification_stepup_fail")
    .where("created_at", ">=", since)
    .execute();
  if (fails.length >= STEPUP_FAIL_MAX) {
    throw new Error("APP-PERM-005: Demasiados intentos fallidos. Espera 15 minutos.");
  }

  const admin = await db
    .selectFrom("users")
    .select(["password_hash"])
    .where("id", "=", adminId)
    .executeTakeFirst();
  const ok = admin ? await comparePassword(password, admin.password_hash) : false;
  if (!ok) {
    await db
      .insertInto("admin_audit_log")
      .values({ admin_id: adminId, action: "notification_stepup_fail", metadata: toJsonb({}) })
      .execute();
    throw new Error("APP-PERM-004: Contrasena incorrecta. Vuelve a intentarlo.");
  }

  await db
    .insertInto("admin_audit_log")
    .values({ admin_id: adminId, action: "notification_stepup_ok", metadata: toJsonb({}) })
    .execute();
}

export const sendAdminNotification = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => sendSchema.parse(input))
  .handler(async ({ data, context }): Promise<SendNotificationResult> => {
    const role = await assertAdmin(context.userId);
    const { db, toJsonb } = await import("@/lib/db.server");
    const { sql } = await import("kysely");

    // Resolver plantilla y tipo efectivo.
    const template = findTemplate(data.templateId);
    if (!template) throw new Error("APP-VAL-007: Plantilla desconocida.");

    const effectiveType: NotifType =
      data.templateId === "custom" ? (data.customType ?? "system") : template.type;

    // Restriccion por rol: admin/system solo admin.
    if ((effectiveType === "admin" || effectiveType === "system") && role !== "admin") {
      throw new Error(
        "APP-PERM-003: Solo un admin puede enviar notificaciones de tipo 'admin' o 'system'.",
      );
    }

    // Override title/message solo para 'custom'; validar y sanitizar.
    let customOverride: { title: string; message: string } | null = null;
    if (data.templateId === "custom") {
      if (!data.customTitle || !data.customMessage) {
        throw new Error("APP-VAL-008: Falta titulo o mensaje personalizado.");
      }
      const title = sanitizeText(data.customTitle, 120, "Titulo");
      const message = sanitizeText(data.customMessage, 500, "Mensaje");
      assertUrlsWhitelisted(title, "Titulo");
      assertUrlsWhitelisted(message, "Mensaje");
      customOverride = { title, message };
    } else {
      // Para plantillas, aun validamos el ctx.
      const missing = template.requiredContext.filter(
        (k) => !data.ctx || !data.ctx[k] || data.ctx[k]!.trim() === "",
      );
      if (missing.length > 0) {
        throw new Error(`APP-VAL-009: Faltan valores de contexto: ${missing.join(", ")}.`);
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
      throw new Error(`APP-VAL-011: Cap ${HARD_CAP} destinatarios. Segmenta el envio.`);
    }

    // Step-up: SIEMPRE exigimos que el admin re-confirme su contrasena,
    // verificada del lado servidor. Trust-nothing: no aceptamos flags booleanos
    // que puedan ser falsificados por un cliente adverso.
    await verifyAdminPasswordOrThrow(context.userId, data.password);

    // Rate-limit final.
    await checkRateLimit(context.userId, uniqIds.length);

    // El admin selecciona destinatarios explicitamente por ID desde la UI,
    // asi que respetamos su intencion - no se excluyen admins/devs.
    const filteredIds = uniqIds;

    // ------ Batch id + audit `pending` ------
    let batchId = data.retryBatchId ?? crypto.randomUUID();
    let toInsertIds = filteredIds;
    if (data.retryBatchId) {
      // Reintento: leer failedIds previos y solo esos.
      const prev = await db
        .selectFrom("admin_audit_log")
        .select(["id", "admin_id", "metadata"])
        .where("action", "=", "notification_send")
        .where(sql<boolean>`metadata->>'batch_id' = ${data.retryBatchId}`)
        .executeTakeFirst();
      if (!prev || prev.admin_id !== context.userId) {
        throw new Error("APP-VAL-013: Reintento invalido.");
      }
      const failed = ((prev.metadata as { failed_ids?: string[] } | null)?.failed_ids ??
        []) as string[];
      toInsertIds = failed.filter((id) => uniqIds.includes(id));
      if (toInsertIds.length === 0) {
        throw new Error("APP-VAL-014: No hay fallos a reintentar en ese batch.");
      }
      batchId = data.retryBatchId;
    }

    const auditPreInsert = await db
      .insertInto("admin_audit_log")
      .values({
        admin_id: context.userId,
        action: "notification_send",
        target_user_id: null,
        metadata: toJsonb({
          batch_id: batchId,
          status: "pending",
          template_id: data.templateId,
          type: effectiveType,
          custom: data.templateId === "custom",
          targets_count: toInsertIds.length,
          started_at: new Date().toISOString(),
          retry_of: data.retryBatchId ?? null,
          title_preview: (customOverride?.title ?? template.title).slice(0, 120),
        }),
      })
      .returning(["id"])
      .executeTakeFirst();

    if (!auditPreInsert) {
      throw new Error("APP-SYS-001: No se pudo registrar el envio. Reintenta.");
    }
    const auditRowId = auditPreInsert.id;

    // ------ Fetch de perfiles para render ------
    const profiles = await db
      .selectFrom("profiles")
      .select(["id", "first_name", "username"])
      .where("id", "in", toInsertIds)
      .execute();
    const profileMap = new Map(profiles.map((p) => [p.id, p]));

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
          sanitizeText(rendered.title, 120, "Titulo");
          sanitizeText(rendered.message, 500, "Mensaje");
          assertUrlsWhitelisted(rendered.title, "Titulo");
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
      try {
        await db.insertInto("notifications").values(rows).execute();
        inserted += rows.length;
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        for (const r of rows) {
          failed.push({ userId: r.user_id, reason });
        }
      }
    }

    const status: SendNotificationResult["status"] =
      failed.length === 0 ? "ok" : inserted === 0 ? "failed" : "partial";

    // ------ Update audit con resultado ------
    await db
      .updateTable("admin_audit_log")
      .set({
        metadata: toJsonb({
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
        }),
      })
      .where("id", "=", auditRowId)
      .execute();

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
  .middleware([requireAuth])
  .inputValidator((input: unknown) => historySchema.parse(input))
  .handler(async ({ data, context }): Promise<NotificationHistoryRow[]> => {
    await assertAdmin(context.userId);
    const { db, isoOrNull } = await import("@/lib/db.server");
    const limit = data.limit ?? 50;

    const rows = await db
      .selectFrom("admin_audit_log")
      .select(["id", "admin_id", "metadata", "created_at"])
      .where("action", "=", "notification_send")
      .orderBy("created_at", "desc")
      .limit(limit)
      .execute();

    const adminIds = Array.from(
      new Set(rows.map((r) => r.admin_id).filter((id): id is string => !!id)),
    );
    const profs =
      adminIds.length > 0
        ? await db
            .selectFrom("profiles")
            .select(["id", "username", "first_name"])
            .where("id", "in", adminIds)
            .execute()
        : [];
    const profMap = new Map(profs.map((p) => [p.id, p]));

    return rows.map((r) => {
      const m = (r.metadata ?? {}) as Record<string, unknown>;
      const p = r.admin_id ? profMap.get(r.admin_id) : undefined;
      return {
        auditId: r.id,
        batchId: (m.batch_id as string) ?? null,
        adminId: r.admin_id ?? "",
        adminUsername: p?.username ?? null,
        adminFirstName: p?.first_name ?? null,
        createdAt: isoOrNull(r.created_at) as string,
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

// Server-only helper: renderiza una plantilla de notificaciones y la inserta con
// supabaseAdmin. Centraliza la sanitización, el fallback de `nombre` y una
// deduplicación de 10s para plantillas `dev_*` (evita spam si el dev hace clic
// varias veces). El nombre `.server.ts` bloquea imports desde código cliente.

import { findTemplate, type NotifTemplateId } from "./notification-templates";

type Ctx = Record<string, string | number | null | undefined>;

export interface SendResult {
  inserted: boolean;
  reason?: string;
}

// Sustituye {nombre} y {ctx.<clave>} con sanitización básica.
function render(source: string, nombre: string, ctx: Ctx): string {
  let out = source.replace(/\{nombre\}/g, nombre);
  out = out.replace(/\{ctx\.([a-z0-9_]+)\}/gi, (_full, key: string) => {
    const raw = ctx[key];
    if (raw === undefined || raw === null || String(raw).trim() === "") {
      throw new Error(`missing_ctx:${key}`);
    }
    return String(raw).replace(/[<>`]/g, "").slice(0, 200);
  });
  return out;
}

export async function sendTemplatedNotification(
  userId: string,
  templateId: NotifTemplateId,
  ctx: Ctx = {},
  opts: { initiatedBySelf?: boolean } = {},
): Promise<SendResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const template = findTemplate(templateId);
  if (!template) return { inserted: false, reason: "no_template" };
  if (templateId === "custom") return { inserted: false, reason: "custom_not_supported" };

  try {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("first_name, username")
      .eq("id", userId)
      .maybeSingle();

    const nombre =
      (profile?.first_name?.trim() || profile?.username?.trim() || "hola").slice(0, 60);

    const title = render(template.title, nombre, ctx).slice(0, 200);
    const message = render(template.message, nombre, ctx).slice(0, 2000);

    // Dedup 10s para plantillas dev_*.
    if (templateId.startsWith("dev_")) {
      const tenSecAgo = new Date(Date.now() - 10_000).toISOString();
      const { data: recent } = await supabaseAdmin
        .from("notifications")
        .select("id")
        .eq("user_id", userId)
        .eq("title", title)
        .gte("created_at", tenSecAgo)
        .limit(1)
        .maybeSingle();
      if (recent) return { inserted: false, reason: "cooldown" };
    }

    const { error } = await supabaseAdmin.from("notifications").insert({
      user_id: userId,
      title,
      message,
      type: template.type,
      is_read: opts.initiatedBySelf === true,
    });
    if (error) throw error;
    return { inserted: true };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    // Log server-side; nunca romper el flujo de negocio por un fallo de notif.
    console.error("[notifications.server] send failed", { userId, templateId, reason });
    return { inserted: false, reason };
  }
}

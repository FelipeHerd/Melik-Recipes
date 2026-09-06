// Central catalog of notification templates.
// Rendering must run server-side (see admin-notifications.functions.ts) so
// PII substitutions and validation stay off the wire.
export type NotifType = "system" | "kiko" | "melik_plus" | "admin";

export type NotifTemplateId =
  | "custom"
  | "welcome_plus_monthly"
  | "welcome_plus_yearly"
  | "plus_renewed"
  | "plus_ended"
  | "trial_expiring"
  | "trial_gift"
  | "kiko_blocked"
  | "kiko_unblocked"
  | "role_promoted"
  | "role_promoted_dev"
  | "role_revoked"
  | "dev_plus_granted"
  | "dev_plus_revoked"
  | "dev_trial_granted"
  | "system_announcement";

export interface NotifTemplate {
  id: NotifTemplateId;
  label: string;
  type: NotifType;
  title: string;
  message: string;
  // Placeholders that must be filled by the admin at send time (excluding
  // {nombre}, which is resolved from the recipient's profile).
  requiredContext: readonly string[];
  // Auto = also triggered by cron/system events. Manual = only via admin UI.
  isAuto: boolean;
  description: string;
}

export const TEMPLATES: readonly NotifTemplate[] = [
  {
    id: "custom",
    label: "Personalizada",
    type: "system",
    title: "",
    message: "",
    requiredContext: [],
    isAuto: false,
    description: "Escribe título y mensaje libres. Sujeto a sanitización y whitelist de dominios.",
  },
  {
    id: "welcome_plus_monthly",
    label: "Bienvenida Melik+ (mensual)",
    type: "melik_plus",
    title: "¡Bienvenido a Melik+! 👑",
    message:
      "Hola {nombre}, tu suscripción mensual está activa. Ya eres parte de la comunidad Melik+ y disfrutas de todos los beneficios: recetas privadas, catálogo oficial, desbloqueos cada 6 meses y 5% de descuento en todas tus compras.",
    requiredContext: [],
    isAuto: true,
    description: "Se dispara automáticamente al suscribirse mensual.",
  },
  {
    id: "welcome_plus_yearly",
    label: "Bienvenida Melik+ (anual)",
    type: "melik_plus",
    title: "¡Bienvenido a Melik+! 👑",
    message:
      "Hola {nombre}, tu suscripción anual está activa. Ya eres parte de la comunidad Melik+ y disfrutas de todos los beneficios: recetas privadas, catálogo oficial, desbloqueos cada 6 meses y 5% de descuento en todas tus compras.",
    requiredContext: [],
    isAuto: true,
    description: "Se dispara automáticamente al suscribirse anual.",
  },
  {
    id: "plus_renewed",
    label: "Renovación Melik+",
    type: "melik_plus",
    title: "✅ Renovamos tu suscripción Melik+",
    message:
      "Hola {nombre}, se procesó el cobro automático de {ctx.monto}. Tu próximo cobro será el {ctx.fecha_proxima}. Puedes cancelar cuando quieras desde tu perfil.",
    requiredContext: ["monto", "fecha_proxima"],
    isAuto: true,
    description: "Cron de renovación diaria. Manual: útil para reenviar tras un fallo del cron.",
  },
  {
    id: "plus_ended",
    label: "Fin de suscripción Melik+",
    type: "melik_plus",
    title: "Tu suscripción Melik+ terminó",
    message:
      "Hola {nombre}, tu período pagado terminó y tu cuenta volvió al plan gratuito. Puedes reactivar Melik+ cuando quieras desde tu perfil.",
    requiredContext: [],
    isAuto: true,
    description: "Cron de renovación diaria (rama expirar).",
  },
  {
    id: "trial_expiring",
    label: "Aviso: trial por expirar",
    type: "melik_plus",
    title: "⏳ Tu prueba de Melik+ está por terminar",
    message:
      "Hola {nombre}, te quedan {ctx.dias} de prueba gratis. Vence el {ctx.fecha_fin}. Suscríbete para no perder recetas ilimitadas, Kiko sin límites, el catálogo oficial y el 5% de descuento.",
    requiredContext: ["dias", "fecha_fin"],
    isAuto: true,
    description: "Cron 3 días antes del fin del trial.",
  },
  {
    id: "trial_gift",
    label: "Regalo de trial",
    type: "melik_plus",
    title: "🎁 Recibiste una prueba gratis de Melik+",
    message:
      "Hola {nombre}, te regalamos {ctx.duracion} de prueba gratis en Melik+. Disfruta recetas ilimitadas, Kiko sin límites, catálogo oficial y 5% de descuento en tus compras. Tu prueba vence el {ctx.fecha_fin}.",
    requiredContext: ["duracion", "fecha_fin"],
    isAuto: true,
    description: "Se dispara al aplicar `grantTrial` desde CRM.",
  },
  {
    id: "kiko_blocked",
    label: "Kiko bloqueado",
    type: "kiko",
    title: "Kiko en pausa",
    message:
      "Hola {nombre}, un administrador pausó tu acceso a Kiko hasta el {ctx.fecha_fin}. Si crees que es un error, escríbenos.",
    requiredContext: ["fecha_fin"],
    isAuto: true,
    description: "Se dispara desde `setKikoBlock` en CRM.",
  },
  {
    id: "kiko_unblocked",
    label: "Kiko desbloqueado",
    type: "kiko",
    title: "Kiko disponible otra vez",
    message: "Hola {nombre}, ya puedes volver a chatear con Kiko. ¡Gracias por tu paciencia!",
    requiredContext: [],
    isAuto: true,
    description: "Se dispara al desbloquear Kiko desde CRM.",
  },
  {
    id: "role_promoted",
    label: "Promoción a admin",
    type: "admin",
    title: "Ahora eres admin",
    message: "Hola {nombre}, se te otorgaron permisos administrativos en Melik.",
    requiredContext: [],
    isAuto: true,
    description: "Solo rol admin puede enviar mensajes de tipo `admin`.",
  },
  {
    id: "role_promoted_dev",
    label: "Promoción a dev",
    type: "admin",
    title: "Ahora eres dev",
    message:
      "Hola {nombre}, se te otorgaron permisos de desarrollador en Melik. Encuentra tus herramientas internas en tu perfil.",
    requiredContext: [],
    isAuto: true,
    description: "Se dispara al asignar rol dev desde el CRM.",
  },
  {
    id: "role_revoked",
    label: "Rol revocado",
    type: "admin",
    title: "Volviste al plan estándar",
    message:
      "Hola {nombre}, un administrador revocó tus permisos elevados. Tu cuenta ahora funciona como usuario estándar.",
    requiredContext: [],
    isAuto: true,
    description: "Se dispara al bajar de admin/dev a user desde el CRM.",
  },
  {
    id: "dev_plus_granted",
    label: "Dev: Melik+ activado",
    type: "melik_plus",
    title: "Activaste Melik+ (dev)",
    message:
      "Hola {nombre}, activaste Melik+ desde tu panel de desarrollador. Los beneficios están disponibles inmediatamente.",
    requiredContext: [],
    isAuto: true,
    description: "Autogenerada por dev al activar Melik+ indefinido.",
  },
  {
    id: "dev_plus_revoked",
    label: "Dev: Melik+ desactivado",
    type: "melik_plus",
    title: "Desactivaste Melik+ (dev)",
    message:
      "Hola {nombre}, desactivaste tu Melik+ desde el panel de desarrollador. Tu cuenta volvió al plan gratuito.",
    requiredContext: [],
    isAuto: true,
    description: "Autogenerada por dev al desactivar Melik+.",
  },
  {
    id: "dev_trial_granted",
    label: "Dev: prueba gratis",
    type: "melik_plus",
    title: "🎁 Prueba de Melik+ (dev)",
    message:
      "Hola {nombre}, te otorgaste {ctx.duracion} de prueba gratis desde el panel de desarrollador. Vence el {ctx.fecha_fin}.",
    requiredContext: ["duracion", "fecha_fin"],
    isAuto: true,
    description: "Autogenerada por dev al darse una prueba.",
  },
  {
    id: "system_announcement",
    label: "Anuncio del sistema",
    type: "system",
    title: "{ctx.titulo}",
    message: "Hola {nombre}, {ctx.mensaje}",
    requiredContext: ["titulo", "mensaje"],
    isAuto: false,
    description: "Anuncio genérico. Solo admin puede enviar tipo `system`.",
  },
] as const;

export function findTemplate(id: NotifTemplateId): NotifTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

import { APP_ERROR_REGEX, ERR, type AppErrorCode } from "./codes";
import { ERRORS } from "./catalog";
import { AppError } from "./AppError";

// Textos ya legibles que se preservan tal cual (no llevan código visible).
// Vienen de server functions históricas o del propio input del usuario.
const FRIENDLY_PASSTHROUGH = new Set<string>([
  "Este nombre de usuario ya está ocupado",
  "Ya tienes un nombre de usuario asignado",
  "No se pudo asignar el nombre de usuario. Inténtalo con otro.",
  "Receta no disponible",
  "Enlace inválido o expirado",
  "Enlace inválido",
  "No autorizado",
]);

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message || "";
  if (typeof err === "string") return err;
  return "";
}

function errorName(err: unknown): string {
  if (err && typeof err === "object" && "name" in err) {
    const n = (err as { name?: unknown }).name;
    if (typeof n === "string") return n;
  }
  return "";
}

/**
 * Convert any thrown value into a user-facing AppError.
 * - Recognizes `APP-XXX-###` codes embedded in the message (server-safe).
 * - Falls back to pattern matching for common Supabase/Auth/network errors.
 * - Preserves a whitelist of already-friendly Spanish messages.
 * - Default is APP-SYS-001; original error goes into `cause` for logs only.
 */
export function toAppError(err: unknown, hint?: AppErrorCode): AppError {
  if (err instanceof AppError) return err;

  const raw = messageOf(err).trim();
  const name = errorName(err);

  // 1) Explicit APP-XXX-### code embedded in message.
  const match = raw.match(APP_ERROR_REGEX);
  if (match) {
    const code = match[0] as AppErrorCode;
    if (ERRORS[code]) return new AppError(code, { cause: err });
  }

  // 2) Whitelisted friendly Spanish message — surface it verbatim, no code.
  if (raw && FRIENDLY_PASSTHROUGH.has(raw)) {
    const app = new AppError(ERR.UNKNOWN, { cause: err, description: raw });
    return Object.assign(app, { title: raw, description: undefined, code: "" as AppErrorCode });
  }

  // 3) DOMException names (camera, storage, etc.)
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return new AppError(ERR.CAMERA_DENIED, { cause: err });
  }
  if (name === "NotFoundError" || name === "OverconstrainedError" || name === "DevicesNotFoundError") {
    return new AppError(ERR.CAMERA_NOT_FOUND, { cause: err });
  }
  if (name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED") {
    return new AppError(ERR.STORAGE_WRITE_FAILED, { cause: err });
  }

  // 4) Pattern rules.
  const lower = raw.toLowerCase();
  if (lower.includes("failed to fetch") || lower.includes("networkerror") || lower === "load failed") {
    return new AppError(ERR.NETWORK_OFFLINE, { cause: err });
  }
  if (lower.includes("timeout") || lower.includes("504")) {
    return new AppError(ERR.NETWORK_TIMEOUT, { cause: err });
  }
  if (/\b5\d{2}\b/.test(lower) || lower.includes("internal server error") || lower.includes("bad gateway") || lower.includes("service unavailable")) {
    return new AppError(ERR.SERVER_ERROR, { cause: err });
  }
  if (
    lower.includes("jwt expired") ||
    lower.includes("invalid token") ||
    lower.includes("no authorization header") ||
    lower.startsWith("unauthorized")
  ) {
    return new AppError(ERR.SESSION_EXPIRED, { cause: err });
  }
  if (lower.includes("invalid login credentials")) {
    return new AppError(ERR.LOGIN_INVALID, { cause: err });
  }
  if (lower.includes("user already registered") || lower.includes("already been registered")) {
    return new AppError(ERR.EMAIL_TAKEN, { cause: err });
  }
  if (
    lower.includes("password should be at least") ||
    lower.includes("weak password") ||
    lower.includes("password is too short") ||
    lower.includes("password is too weak")
  ) {
    return new AppError(ERR.PASSWORD_WEAK, { cause: err });
  }
  if (lower.includes("email not confirmed")) {
    return new AppError(ERR.EMAIL_NOT_CONFIRMED, { cause: err });
  }
  if (
    lower.includes("otp expired") ||
    lower.includes("token has expired or is invalid") ||
    lower.includes("expired or invalid")
  ) {
    return new AppError(ERR.RECOVERY_LINK_EXPIRED, { cause: err });
  }
  if (lower.includes("signups not allowed")) {
    return new AppError(ERR.EMAIL_TAKEN, { cause: err });
  }
  if (lower.includes("rate limit") || lower.includes("over_email_send_rate")) {
    return new AppError(ERR.TOO_MANY_ATTEMPTS, { cause: err });
  }
  if (lower.includes("quotaexceeded") || lower.includes("quota exceeded")) {
    return new AppError(ERR.STORAGE_WRITE_FAILED, { cause: err });
  }

  // 5) Hint from the call site.
  if (hint && ERRORS[hint]) return new AppError(hint, { cause: err });

  // 6) Fallback.
  return new AppError(ERR.UNKNOWN, { cause: err });
}

// Authorization helpers replacing Supabase RLS + the privilege-escalation
// triggers (prevent_profile_privilege_escalation, prevent_recipe_privilege_
// escalation) that used to run inside Postgres. Those triggers existed
// because Supabase's PostgREST layer let the client send arbitrary UPDATE
// payloads straight to the database. In this architecture the Node backend
// is the only thing that ever runs SQL, so the same guarantee is achieved
// here instead — call these helpers from every mutation path.
import { db } from "@/lib/db.server";

/** Active Melik+ subscription: either the permanent flag or an unexpired
 *  trial window. Ported near-verbatim from the old premium.server.ts. */
export async function hasActivePremium(userId: string): Promise<boolean> {
  const row = await db
    .selectFrom("profiles")
    .select(["is_premium", "premium_until"])
    .where("id", "=", userId)
    .executeTakeFirst();
  if (!row) return false;
  if (row.is_premium) return true;
  if (row.premium_until) {
    const until = new Date(row.premium_until as unknown as string).getTime();
    if (Number.isFinite(until) && until > Date.now()) return true;
  }
  return false;
}

async function hasRole(userId: string, role: "admin" | "dev"): Promise<boolean> {
  const row = await db
    .selectFrom("user_roles")
    .select(["role"])
    .where("user_id", "=", userId)
    .where("role", "=", role)
    .executeTakeFirst();
  return !!row;
}

/** Legacy helper kept for content-gating decisions (e.g. Melik+ bypass for
 *  internal accounts). */
export async function isAdminOrDev(userId: string): Promise<boolean> {
  const rows = await db
    .selectFrom("user_roles")
    .select(["role"])
    .where("user_id", "=", userId)
    .where("role", "in", ["admin", "dev"])
    .execute();
  return rows.length > 0;
}

/** Admin-only. Use for admin panel gating and privileged writes (official
 *  recipes, notifications, impersonation, CRM writes). `dev` is NOT admin. */
export async function isAdmin(userId: string): Promise<boolean> {
  return hasRole(userId, "admin");
}

export async function isDev(userId: string): Promise<boolean> {
  return hasRole(userId, "dev");
}

export async function assertAdmin(userId: string): Promise<void> {
  if (!(await isAdmin(userId))) {
    throw new Error("APP-PERM-002: admin required");
  }
}

export async function assertOwnerOrAdmin(userId: string, resourceOwnerId: string): Promise<void> {
  if (userId === resourceOwnerId) return;
  await assertAdmin(userId);
}

// Columns `prevent_profile_privilege_escalation` used to freeze against any
// non-service-role write (final column set per
// supabase/migrations/20260805154820_*.sql).
const PROFILE_PRIVILEGED_COLUMNS = [
  "is_premium",
  "role",
  "kiko_blocked_until",
  "premium_until",
  "subscription_status",
  "gateway_customer_id",
  "paid_months_total",
  "voice_seconds_used_today",
  "voice_usage_date",
] as const;

/** Strips profile columns that only a trusted internal path (payment
 *  simulation, cron renewal jobs, admin CRM actions) may set. Pass
 *  `isServiceContext: true` from those trusted call sites only — never from
 *  a generic "update my profile" endpoint. */
export function sanitizeProfilePatch<T extends Record<string, unknown>>(
  patch: T,
  opts: { isServiceContext: boolean },
): Partial<T> {
  if (opts.isServiceContext) return patch;
  const clean = { ...patch };
  for (const key of PROFILE_PRIVILEGED_COLUMNS) {
    delete clean[key as keyof T];
  }
  return clean;
}

// Columns `prevent_recipe_privilege_escalation` guarded (is_official_melik,
// is_premium_only) plus share_token, which had a separate column-level
// REVOKE. `original_author` is intentionally NOT here — it's a pure
// data-integrity freeze-once-set rule, enforced by the protect_original_
// author DB trigger (db/init/001_schema.sql), not an authorization concern.
const RECIPE_PRIVILEGED_COLUMNS = ["is_official_melik", "is_premium_only", "share_token"] as const;

/** Strips recipe columns that only an admin may set. `dev` does NOT count
 *  (matches supabase/migrations/20260725210110_*.sql narrowing this to
 *  admin-only). */
export function sanitizeRecipePatch<T extends Record<string, unknown>>(
  patch: T,
  opts: { isAdmin: boolean },
): Partial<T> {
  if (opts.isAdmin) return patch;
  const clean = { ...patch };
  for (const key of RECIPE_PRIVILEGED_COLUMNS) {
    delete clean[key as keyof T];
  }
  return clean;
}

// Columns `prevent_notification_tampering` allowed a non-owner-safe write to
// touch: only `is_read`. Every other field on notifications must go through
// a trusted internal path (sendNotification, cron jobs), never a generic
// "update my notification" endpoint.
export function sanitizeNotificationPatch<T extends Record<string, unknown>>(
  patch: T,
  opts: { isServiceContext: boolean },
): Partial<T> {
  if (opts.isServiceContext) return patch;
  const allowed: Partial<T> = {};
  if ("is_read" in patch) (allowed as Record<string, unknown>).is_read = patch.is_read;
  return allowed;
}

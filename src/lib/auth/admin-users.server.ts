// Replaces supabaseAdmin.auth.admin.* (listUsers/getUserById/deleteUser/
// generateLink) called from admin.functions.ts, admin-crm.functions.ts,
// admin-metrics.functions.ts, admin-notifications.functions.ts, and
// recipes.functions.ts's deleteAccount.
import { db } from "@/lib/db.server";
import { signImpersonationToken, ACCESS_TOKEN_TTL_SECONDS } from "@/lib/auth/jwt.server";

export type AdminUserRecord = { id: string; email: string; created_at: Date };

export async function listUsersPage(page: number, perPage: number): Promise<AdminUserRecord[]> {
  return db
    .selectFrom("users")
    .select(["id", "email", "created_at"])
    .orderBy("created_at", "asc")
    .limit(perPage)
    .offset((page - 1) * perPage)
    .execute();
}

/** Full scan, for admin-metrics.functions.ts's "all users" report. This app's
 *  user count doesn't warrant Supabase's old 200-per-page pagination loop. */
export async function listAllUsers(): Promise<AdminUserRecord[]> {
  return db
    .selectFrom("users")
    .select(["id", "email", "created_at"])
    .orderBy("created_at", "asc")
    .execute();
}

export async function getUserById(id: string): Promise<AdminUserRecord | undefined> {
  return db
    .selectFrom("users")
    .select(["id", "email", "created_at"])
    .where("id", "=", id)
    .executeTakeFirst();
}

export async function searchUsersByEmail(needle: string, limit = 25): Promise<AdminUserRecord[]> {
  return db
    .selectFrom("users")
    .select(["id", "email", "created_at"])
    .where("email", "ilike", `%${needle}%`)
    .limit(limit)
    .execute();
}

export async function deleteUserAccount(id: string): Promise<void> {
  // Cascades to profiles/recipes/notifications/etc via ON DELETE CASCADE
  // (db/init/001_schema.sql). Any still-active token for this user is
  // rejected by requireAuth's next lookup (the users row is simply gone).
  await db.deleteFrom("users").where("id", "=", id).execute();
}

/** Returns a short-lived token the admin panel's client immediately swaps
 *  into its session store — replacing generateLink({type:"magiclink"}),
 *  since there's no email to click through anymore (see migration plan). */
export async function generateImpersonationToken(
  targetUserId: string,
  adminId: string,
): Promise<{ token: string; email: string }> {
  const target = await db
    .selectFrom("users")
    .select(["id", "email", "token_version"])
    .where("id", "=", targetUserId)
    .executeTakeFirst();
  if (!target) throw new Error("APP-ADMIN-001: usuario sin correo válido");
  const token = signImpersonationToken({
    sub: target.id,
    email: target.email,
    tokenVersion: target.token_version,
    impersonatedBy: adminId,
  });
  return { token, email: target.email };
}

export { ACCESS_TOKEN_TTL_SECONDS };

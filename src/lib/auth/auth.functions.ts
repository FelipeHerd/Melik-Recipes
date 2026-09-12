import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/require-auth.server";
import { USERNAME_DOT_FORBIDDEN, USERNAME_REGEX } from "@/lib/username.functions";

// Session payload returned to the client on login/signup/resetPassword —
// stored via src/lib/auth/session-store.ts's setSession().
export type AuthSession = {
  token: string;
  userId: string;
  email: string;
  exp: number;
};

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export const login = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => loginSchema.parse(input))
  .handler(async ({ data }): Promise<AuthSession> => {
    const { db } = await import("@/lib/db.server");
    const { comparePassword } = await import("@/lib/auth/password.server");
    const { signAccessToken, ACCESS_TOKEN_TTL_SECONDS } = await import("@/lib/auth/jwt.server");

    const user = await db
      .selectFrom("users")
      .select(["id", "email", "password_hash", "token_version"])
      .where("email", "=", data.email)
      .executeTakeFirst();
    // Same generic message whether the email doesn't exist or the password
    // is wrong — never reveal which (matches the original "Correo o
    // contraseña incorrectos" behavior).
    if (!user) throw new Error("Invalid login credentials");
    const ok = await comparePassword(data.password, user.password_hash);
    if (!ok) throw new Error("Invalid login credentials");

    const token = signAccessToken({ sub: user.id, email: user.email, tokenVersion: user.token_version });
    return {
      token,
      userId: user.id,
      email: user.email,
      exp: Math.floor(Date.now() / 1000) + ACCESS_TOKEN_TTL_SECONDS,
    };
  });

const signupSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(USERNAME_REGEX)
    .refine((v) => !USERNAME_DOT_FORBIDDEN.test(v)),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8),
});

export const signup = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => signupSchema.parse(input))
  .handler(async ({ data }): Promise<AuthSession> => {
    const { db } = await import("@/lib/db.server");
    const { hashPassword } = await import("@/lib/auth/password.server");
    const { signAccessToken, ACCESS_TOKEN_TTL_SECONDS } = await import("@/lib/auth/jwt.server");

    const existing = await db
      .selectFrom("users")
      .select(["id"])
      .where("email", "=", data.email)
      .executeTakeFirst();
    if (existing) throw new Error("User already registered");

    const usernameTaken = await db
      .selectFrom("profiles")
      .select(["id"])
      .where("username", "=", data.username)
      .executeTakeFirst();
    if (usernameTaken) throw new Error("Este nombre de usuario ya está ocupado");

    const passwordHash = await hashPassword(data.password);

    // email_confirmed defaults to true (auto-confirm — no SMTP wired up yet,
    // see migration plan). token_version defaults to 0.
    const session = await db.transaction().execute(async (trx) => {
      const user = await trx
        .insertInto("users")
        .values({ email: data.email, password_hash: passwordHash })
        .returning(["id", "email", "token_version"])
        .executeTakeFirstOrThrow();
      await trx
        .insertInto("profiles")
        .values({
          id: user.id,
          first_name: data.firstName,
          last_name: data.lastName,
          username: data.username,
        })
        .execute();
      return user;
    });

    const token = signAccessToken({
      sub: session.id,
      email: session.email,
      tokenVersion: session.token_version,
    });
    return {
      token,
      userId: session.id,
      email: session.email,
      exp: Math.floor(Date.now() / 1000) + ACCESS_TOKEN_TTL_SECONDS,
    };
  });

const requestPasswordResetSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

// Always returns { ok: true } regardless of whether the email exists, to
// avoid account enumeration (matches the original "same UX either way" — see
// auth.reset.tsx). No SMTP is wired up: the token is logged server-side and
// exposed via the admin panel (src/lib/auth/admin-users.server.ts) until
// real email sending is added (src/lib/notifications/mailer.server.ts).
export const requestPasswordReset = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => requestPasswordResetSchema.parse(input))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { db } = await import("@/lib/db.server");
    const { sendResetEmail } = await import("@/lib/notifications/mailer.server");

    const user = await db
      .selectFrom("users")
      .select(["id"])
      .where("email", "=", data.email)
      .executeTakeFirst();
    if (user) {
      const token = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await db
        .insertInto("password_reset_tokens")
        .values({ user_id: user.id, token, expires_at: expiresAt })
        .execute();
      await sendResetEmail(data.email, token);
    }
    return { ok: true };
  });

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
});

// Unauthenticated (no requireAuth) — the reset token itself is the
// credential, matching how a Supabase recovery-link session worked.
export const resetPassword = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => resetPasswordSchema.parse(input))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { db } = await import("@/lib/db.server");
    const { hashPassword } = await import("@/lib/auth/password.server");

    const row = await db
      .selectFrom("password_reset_tokens")
      .select(["id", "user_id", "expires_at", "used_at"])
      .where("token", "=", data.token)
      .executeTakeFirst();
    if (!row || row.used_at || new Date(row.expires_at as unknown as string).getTime() < Date.now()) {
      throw new Error("Token has expired or is invalid");
    }

    const passwordHash = await hashPassword(data.password);
    await db.transaction().execute(async (trx) => {
      await trx
        .updateTable("users")
        // Bump token_version so any other active session is signed out —
        // a reasonable default whenever the password changes.
        .set((eb) => ({ password_hash: passwordHash, token_version: eb("token_version", "+", 1) }))
        .where("id", "=", row.user_id)
        .execute();
      await trx.updateTable("password_reset_tokens").set({ used_at: new Date() }).where("id", "=", row.id).execute();
    });
    return { ok: true };
  });

const changePasswordSchema = z.object({ password: z.string().min(8) });

// Authenticated "change password" flow — no current-password re-check,
// matching the original supabase.auth.updateUser({ password }) behavior
// (it only required an active session, not re-authentication).
export const changePassword = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => changePasswordSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { db } = await import("@/lib/db.server");
    const { hashPassword } = await import("@/lib/auth/password.server");
    const passwordHash = await hashPassword(data.password);
    await db.updateTable("users").set({ password_hash: passwordHash }).where("id", "=", context.userId).execute();
    return { ok: true };
  });

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/require-auth";

export const USERNAME_REGEX = /^[a-z0-9_.]{3,20}$/;
// No leading/trailing dot and no consecutive dots.
export const USERNAME_DOT_FORBIDDEN = /(^\.|\.$|\.\.)/;

export function isValidUsername(u: string): boolean {
  return USERNAME_REGEX.test(u) && !USERNAME_DOT_FORBIDDEN.test(u);
}

const usernameSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(USERNAME_REGEX)
    .refine((v) => !USERNAME_DOT_FORBIDDEN.test(v), "invalid_format"),
});

export const checkUsernameAvailable = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: { username: string }) => usernameSchema.parse(input))
  .handler(async ({ data }) => {
    const { db } = await import("@/lib/db.server");
    const taken = await db
      .selectFrom("profiles")
      .select(["id"])
      .where("username", "=", data.username)
      .executeTakeFirst();
    return { available: !taken };
  });

// Immutable claim: only succeeds when the caller's username is currently
// NULL. This single guarded UPDATE replaces the old set_my_username() RPC's
// `WHERE id = uid AND username IS NULL` clause — the DB CHECK constraint
// (db/init/001_schema.sql) still enforces format + uniqueness.
export const claimUsername = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: { username: string }) => usernameSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { db } = await import("@/lib/db.server");
    const taken = await db
      .selectFrom("profiles")
      .select(["id"])
      .where("username", "=", data.username)
      .executeTakeFirst();
    if (taken) throw new Error("Este nombre de usuario ya está ocupado");

    try {
      const row = await db
        .updateTable("profiles")
        .set({ username: data.username })
        .where("id", "=", context.userId)
        .where("username", "is", null)
        .returning(["username"])
        .executeTakeFirst();
      if (!row) throw new Error("Ya tienes un nombre de usuario asignado");
      return { username: row.username };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("Ya tienes")) throw err;
      if (msg.includes("profiles_username_unique_idx") || msg.includes("duplicate key")) {
        throw new Error("Este nombre de usuario ya está ocupado");
      }
      if (msg.includes("profiles_username_format_chk")) {
        throw new Error(
          "Solo se permiten 3–20 caracteres: letras minúsculas, números, guion bajo (_) y punto (.). Sin puntos al inicio, al final ni consecutivos.",
        );
      }
      throw new Error("No se pudo asignar el nombre de usuario. Inténtalo con otro.");
    }
  });

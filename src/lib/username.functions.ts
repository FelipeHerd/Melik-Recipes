import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { username: string }) => usernameSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: available, error } = await context.supabase.rpc("is_username_available", {
      _username: data.username,
    });
    if (error) throw new Error("APP-SYS-001: " + error.message);
    return { available: !!available };
  });

export const claimUsername = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { username: string }) => usernameSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: username, error } = await context.supabase.rpc("set_my_username", {
      _username: data.username,
    });
    if (error) {
      const msg = error.message || "";
      if (msg.includes("username_taken")) throw new Error("Este nombre de usuario ya está ocupado");
      if (msg.includes("username_already_set")) throw new Error("Ya tienes un nombre de usuario asignado");
      if (msg.includes("invalid_format") || msg.includes("profiles_username_format_chk"))
        throw new Error(
          "Solo se permiten 3–20 caracteres: letras minúsculas, números, guion bajo (_) y punto (.). Sin puntos al inicio, al final ni consecutivos.",
        );
      if (msg.includes("profiles_username_unique_idx") || msg.includes("duplicate key"))
        throw new Error("Este nombre de usuario ya está ocupado");
      throw new Error("No se pudo asignar el nombre de usuario. Inténtalo con otro.");
    }
    return { username };
  });

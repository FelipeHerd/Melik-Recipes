// SECURITY: server-only guard for handlers that only cuentas `dev` pueden ejecutar.
// Lee `user_roles` en cada llamada con `supabaseAdmin` — no confía en el JWT.
// Nombre `.server.ts` = el import guard rechaza cualquier import desde código cliente.

export async function assertDevOrReject(userId: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "dev")
    .maybeSingle();
  if (!data) {
    throw new Response("Forbidden", { status: 403 });
  }
}

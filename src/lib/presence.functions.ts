// Presence tracking — replaces the client-joinable Realtime channel.
// Users upsert their own heartbeat row (RLS: own row only, no read).
// Admins query the live count via an admin-gated server function.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const heartbeatPresence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: true }> => {
    const { error } = await context.supabase
      .from("presence_heartbeats")
      .upsert(
        { user_id: context.userId, last_seen: new Date().toISOString() },
        { onConflict: "user_id" },
      );
    if (error) throw new Error("APP-SYS-001: " + error.message);
    return { ok: true };
  });

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("APP-PERM-002: forbidden");
}

export const getLivePresenceCount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ count: number }> => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const cutoff = new Date(Date.now() - 60_000).toISOString();
    const { count, error } = await supabaseAdmin
      .from("presence_heartbeats")
      .select("*", { count: "exact", head: true })
      .gt("last_seen", cutoff);
    if (error) throw new Error("APP-SYS-001: " + error.message);
    return { count: count ?? 0 };
  });

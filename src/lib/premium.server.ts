// Shared premium/subscription helpers for server functions.
// Import via dynamic `await import()` inside a handler (never at module scope
// of a `*.functions.ts` file) to keep this out of the client bundle.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Returns true when the user has an active Melik+ subscription: either the
 * permanent `is_premium` flag or an unexpired `premium_until` trial window.
 * Reads via the service role so RLS doesn't hide the row from us.
 */
export async function hasActivePremium(userId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("is_premium, premium_until")
    .eq("id", userId)
    .maybeSingle();
  if (error) return false;
  if (data?.is_premium) return true;
  if (data?.premium_until) {
    const until = new Date(data.premium_until as unknown as string).getTime();
    if (Number.isFinite(until) && until > Date.now()) return true;
  }
  return false;
}

/** Returns true when the user has admin or dev role. Legacy helper kept
 *  for content-gating decisions (e.g. Melik+ bypass for internal accounts). */
export async function isAdminOrDev(userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "dev"]);
  return (data ?? []).length > 0;
}

/** Returns true only when the user has the admin role. Use this for admin
 *  panel gating and privileged writes (official recipes, notifications,
 *  impersonation, CRM writes). `dev` is NOT an admin. */
export async function isAdmin(userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  return !!data;
}

/** Returns true only when the user has the dev role. */
export async function isDev(userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "dev")
    .maybeSingle();
  return !!data;
}

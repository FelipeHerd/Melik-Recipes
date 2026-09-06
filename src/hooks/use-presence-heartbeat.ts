// Global presence heartbeat. Writes to a server-side table (RLS-protected)
// instead of a client-joinable Realtime channel, so only admins can see who
// is online. Pings every 30s while a session is active.
import { useEffect } from "react";
import { useSessionUser } from "@/components/UserMenu";
import { heartbeatPresence } from "@/lib/presence.functions";

export function usePresenceHeartbeat() {
  const { userId } = useSessionUser();
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const ping = () => {
      if (cancelled) return;
      void heartbeatPresence().catch(() => {});
    };
    ping();
    const id = window.setInterval(ping, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [userId]);
}

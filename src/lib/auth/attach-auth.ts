import { createMiddleware } from "@tanstack/react-start";
import { getToken } from "@/lib/auth/session-store";

// Direct replacement for src/integrations/supabase/auth-attacher.ts's
// attachSupabaseAuth — registered as a global `functionMiddleware` in
// src/start.ts so every server-fn RPC carries the bearer token.
export const attachAuth = createMiddleware({ type: "function" }).client(async ({ next }) => {
  const token = getToken();
  return next({
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
});

import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

// Direct replacement for src/integrations/supabase/auth-middleware.ts's
// requireSupabaseAuth — same contract (context.userId), so every
// `.middleware([requireSupabaseAuth])` call site becomes a one-line import
// swap to `.middleware([requireAuth])`. There is no more `context.supabase`
// (RLS-scoped client) — handlers import `db` from `@/lib/db.server` directly
// and enforce authorization explicitly via `@/lib/auth/authorize.server`.
//
// This file is deliberately NOT named `*.server.ts`: it's imported at
// module scope by every `*.functions.ts` file (as `.middleware([requireAuth])`),
// which are themselves reachable from the client bundle graph. Its own
// server-only dependencies (jwt.server.ts, db.server.ts) are dynamically
// imported inside the `.server()` callback below instead of statically at
// the top of this file, so the import-protection plugin doesn't trace a
// static edge from client-reachable code into a `*.server.ts` module.
export const requireAuth = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const request = getRequest();
  if (!request?.headers) {
    throw new Error("Unauthorized: No request headers available");
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader) {
    throw new Error("Unauthorized: No authorization header provided");
  }
  if (!authHeader.startsWith("Bearer ")) {
    throw new Error("Unauthorized: Only Bearer tokens are supported");
  }

  const token = authHeader.slice("Bearer ".length);
  if (!token) {
    throw new Error("Unauthorized: No token provided");
  }

  const { verifyAccessToken } = await import("@/lib/auth/jwt.server");
  const claims = verifyAccessToken(token);
  if (!claims) {
    throw new Error("Unauthorized: Invalid token");
  }

  // Enforce "sign out everywhere": a bumped token_version invalidates every
  // previously issued token for this user.
  const { db } = await import("@/lib/db.server");
  const user = await db
    .selectFrom("users")
    .select(["token_version"])
    .where("id", "=", claims.sub)
    .executeTakeFirst();
  if (!user || user.token_version !== claims.tokenVersion) {
    throw new Error("Unauthorized: Token has been revoked");
  }

  return next({
    context: {
      userId: claims.sub,
      email: claims.email,
    },
  });
});

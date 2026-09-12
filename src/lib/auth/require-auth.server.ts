import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { verifyAccessToken } from "@/lib/auth/jwt.server";
import { db } from "@/lib/db.server";

// Direct replacement for src/integrations/supabase/auth-middleware.ts's
// requireSupabaseAuth — same contract (context.userId), so every
// `.middleware([requireSupabaseAuth])` call site becomes a one-line import
// swap to `.middleware([requireAuth])`. There is no more `context.supabase`
// (RLS-scoped client) — handlers import `db` from `@/lib/db.server` directly
// and enforce authorization explicitly via `@/lib/auth/authorize.server`.
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

  const claims = verifyAccessToken(token);
  if (!claims) {
    throw new Error("Unauthorized: Invalid token");
  }

  // Enforce "sign out everywhere": a bumped token_version invalidates every
  // previously issued token for this user.
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

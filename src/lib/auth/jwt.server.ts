import jwt from "jsonwebtoken";

// No refresh-token table: a single longer-lived access token is issued, and
// "sign out everywhere" is implemented via `token_version` (bump the column,
// old tokens fail the version check on their next verify). Simpler than a
// revocation table for this app's scale — see migration plan Section 3.3.
export const ACCESS_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

export type AccessTokenClaims = {
  sub: string;
  email: string;
  tokenVersion: number;
};

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return secret;
}

export function signAccessToken(claims: AccessTokenClaims): string {
  return jwt.sign(claims, getSecret(), { expiresIn: ACCESS_TOKEN_TTL_SECONDS });
}

// Short-lived token for admin "impersonate user" — the admin panel's
// impersonate button swaps the admin's session for this token directly
// (there's no email link to click through anymore, see admin-users.server.ts).
const IMPERSONATION_TOKEN_TTL_SECONDS = 5 * 60;

export function signImpersonationToken(
  claims: AccessTokenClaims & { impersonatedBy: string },
): string {
  return jwt.sign(claims, getSecret(), { expiresIn: IMPERSONATION_TOKEN_TTL_SECONDS });
}

// Verifies signature + expiry only. Callers that need to honor "sign out
// everywhere" must additionally compare `tokenVersion` against the current
// value in the `users` table (see requireAuth in require-auth.server.ts).
export function verifyAccessToken(token: string): AccessTokenClaims | null {
  try {
    const decoded = jwt.verify(token, getSecret());
    if (typeof decoded !== "object" || decoded === null) return null;
    const { sub, email, tokenVersion } = decoded as Record<string, unknown>;
    if (typeof sub !== "string" || typeof email !== "string" || typeof tokenVersion !== "number") {
      return null;
    }
    return { sub, email, tokenVersion };
  } catch {
    return null;
  }
}

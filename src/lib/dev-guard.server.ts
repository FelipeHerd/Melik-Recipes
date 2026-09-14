// SECURITY: server-only guard for handlers that only `dev` accounts may run.
// Re-checks `user_roles` on every call — never trusts the JWT for this.

export async function assertDevOrReject(userId: string): Promise<void> {
  const { isDev } = await import("@/lib/auth/authorize.server");
  if (!(await isDev(userId))) {
    throw new Response("Forbidden", { status: 403 });
  }
}

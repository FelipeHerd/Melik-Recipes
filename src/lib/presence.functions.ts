// Presence tracking — replaces the client-joinable Realtime channel.
// Users upsert their own heartbeat row. Admins query the live count via an
// admin-gated server function.
import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "@/lib/auth/require-auth.server";

export const heartbeatPresence = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<{ ok: true }> => {
    const { db } = await import("@/lib/db.server");
    const now = new Date();
    await db
      .insertInto("presence_heartbeats")
      .values({ user_id: context.userId, last_seen: now })
      .onConflict((oc) => oc.column("user_id").doUpdateSet({ last_seen: now }))
      .execute();
    return { ok: true };
  });

async function assertAdmin(userId: string) {
  const { isAdmin } = await import("@/lib/auth/authorize.server");
  if (!(await isAdmin(userId))) throw new Error("APP-PERM-002: forbidden");
}

export const getLivePresenceCount = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<{ count: number }> => {
    await assertAdmin(context.userId);
    const { db } = await import("@/lib/db.server");
    const { sql } = await import("kysely");
    const cutoff = new Date(Date.now() - 60_000);
    const { count } = await db
      .selectFrom("presence_heartbeats")
      .select(sql<number>`count(*)`.as("count"))
      .where("last_seen", ">", cutoff)
      .executeTakeFirstOrThrow();
    return { count: Number(count) };
  });

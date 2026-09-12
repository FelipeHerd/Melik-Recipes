// Discover chats: cloud-persisted conversations with Chef AI (Vision).
// Images stored under the local `chat-images` bucket; DB keeps only the path.
import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "@/lib/auth/require-auth.server";
import { z } from "zod";

const CHAT_IMAGE_BUCKET = "chat-images";
const SIGNED_URL_TTL = 60 * 60 * 24 * 7;

export type AttachedRecipeMeta = {
  id: string;
  title: string;
  source: "mine" | "official";
};

export type StoredMessage = {
  role: "user" | "assistant";
  text: string;
  image_path?: string;
  attached_recipe?: AttachedRecipeMeta;
  created_at: string;
};

export type DiscoverChatSummary = {
  id: string;
  title: string;
  updatedAt: string;
};

export type ResolvedMessage = StoredMessage & { image_url?: string };

export type DiscoverChatFull = {
  id: string;
  title: string;
  messages: ResolvedMessage[];
  createdAt: string;
  updatedAt: string;
};

// ---------- LIST ----------
export const listDiscoverChats = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<DiscoverChatSummary[]> => {
    const { db, isoOrNull } = await import("@/lib/db.server");
    const rows = await db
      .selectFrom("discover_chats")
      .select(["id", "title", "updated_at"])
      .where("user_id", "=", context.userId)
      .orderBy("updated_at", "desc")
      .limit(100)
      .execute();
    return rows.map((r) => ({ id: r.id, title: r.title, updatedAt: isoOrNull(r.updated_at) as string }));
  });

// ---------- GET (resolves signed URLs) ----------
const idSchema = z.object({ id: z.string().uuid() });

export const getDiscoverChat = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => idSchema.parse(input))
  .handler(async ({ data, context }): Promise<DiscoverChatFull> => {
    const { db, isoOrNull } = await import("@/lib/db.server");
    const row = await db
      .selectFrom("discover_chats")
      .select(["id", "title", "messages", "created_at", "updated_at"])
      .where("id", "=", data.id)
      .where("user_id", "=", context.userId)
      .executeTakeFirst();
    if (!row) throw new Error("APP-RCP-001: not found");

    const raw = Array.isArray(row.messages) ? (row.messages as StoredMessage[]) : [];
    const paths = Array.from(new Set(raw.map((m) => m.image_path).filter((p): p is string => !!p)));
    let signedMap = new Map<string, string>();
    if (paths.length > 0) {
      const { signPaths } = await import("@/lib/storage/signed-url.server");
      signedMap = signPaths(CHAT_IMAGE_BUCKET, paths, SIGNED_URL_TTL);
    }

    const messages: ResolvedMessage[] = raw.map((m) => ({
      ...m,
      image_url: m.image_path ? signedMap.get(m.image_path) : undefined,
    }));

    return {
      id: row.id,
      title: row.title,
      messages,
      createdAt: isoOrNull(row.created_at) as string,
      updatedAt: isoOrNull(row.updated_at) as string,
    };
  });

// ---------- CREATE ----------
const createSchema = z.object({
  title: z.string().min(1).max(120).optional(),
});

export const createDiscoverChat = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => createSchema.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { db, toJsonb } = await import("@/lib/db.server");
    const row = await db
      .insertInto("discover_chats")
      .values({ user_id: context.userId, title: data.title ?? "Nuevo chat", messages: toJsonb([]) })
      .returning(["id"])
      .executeTakeFirstOrThrow();
    return { id: row.id };
  });

// ---------- APPEND MESSAGE ----------
const appendSchema = z.object({
  id: z.string().uuid(),
  message: z.object({
    role: z.enum(["user", "assistant"]),
    text: z.string(),
    image_path: z.string().optional(),
    attached_recipe: z
      .object({
        id: z.string(),
        title: z.string().max(200),
        source: z.enum(["mine", "official"]),
      })
      .optional(),
  }),
});

export const appendDiscoverMessage = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => appendSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { db, toJsonb } = await import("@/lib/db.server");
    const row = await db
      .selectFrom("discover_chats")
      .select(["messages"])
      .where("id", "=", data.id)
      .where("user_id", "=", context.userId)
      .executeTakeFirst();
    if (!row) throw new Error("APP-RCP-001: not found");

    const current = Array.isArray(row.messages) ? (row.messages as StoredMessage[]) : [];
    const next: StoredMessage[] = [...current, { ...data.message, created_at: new Date().toISOString() }];

    await db
      .updateTable("discover_chats")
      .set({ messages: toJsonb(next), updated_at: new Date() })
      .where("id", "=", data.id)
      .where("user_id", "=", context.userId)
      .execute();
    return { ok: true };
  });

// ---------- RENAME ----------
const renameSchema = z.object({ id: z.string().uuid(), title: z.string().min(1).max(120) });
export const renameDiscoverChat = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => renameSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { db } = await import("@/lib/db.server");
    await db
      .updateTable("discover_chats")
      .set({ title: data.title })
      .where("id", "=", data.id)
      .where("user_id", "=", context.userId)
      .execute();
    return { ok: true };
  });

// ---------- DELETE ----------
export const deleteDiscoverChat = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => idSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { db } = await import("@/lib/db.server");
    // Remove chat images first (best-effort).
    const row = await db
      .selectFrom("discover_chats")
      .select(["messages"])
      .where("id", "=", data.id)
      .where("user_id", "=", context.userId)
      .executeTakeFirst();
    const paths = (row?.messages as StoredMessage[] | undefined)?.map((m) => m.image_path).filter((p): p is string => !!p);
    if (paths && paths.length > 0) {
      const { deleteFile } = await import("@/lib/storage/local-storage.server");
      await Promise.all(paths.map((p) => deleteFile(CHAT_IMAGE_BUCKET, p).catch(() => {})));
    }
    await db.deleteFrom("discover_chats").where("id", "=", data.id).where("user_id", "=", context.userId).execute();
    return { ok: true };
  });

// ---------- UPLOAD IMAGE ----------
const uploadSchema = z.object({
  chatId: z.string().uuid(),
  base64: z.string().min(1),
  mime: z.string().default("image/jpeg"),
});

export const uploadChatImage = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => uploadSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ path: string }> => {
    const clean = data.base64.replace(/^data:[^;]+;base64,/, "");
    const bytes = Buffer.from(clean, "base64");
    if (bytes.length > 6 * 1024 * 1024) throw new Error("APP-FILE-002: image >6MB");

    const ext = data.mime.includes("png") ? "png" : "jpg";
    const path = `${context.userId}/${data.chatId}/${crypto.randomUUID()}.${ext}`;

    const { saveFile } = await import("@/lib/storage/local-storage.server");
    await saveFile(CHAT_IMAGE_BUCKET, path, bytes);
    return { path };
  });

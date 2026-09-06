// Discover chats: cloud-persisted conversations with Chef AI (Vision).
// Images stored in private `chat-images` bucket; DB keeps only the path.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

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
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DiscoverChatSummary[]> => {
    const { data, error } = await context.supabase
      .from("discover_chats")
      .select("id, title, updated_at")
      .eq("user_id", context.userId)
      .order("updated_at", { ascending: false })
      .limit(100);
    if (error) throw new Error("APP-SYS-001: " + error.message);
    return (data ?? []).map((r) => ({
      id: r.id,
      title: r.title,
      updatedAt: r.updated_at,
    }));
  });

// ---------- GET (resolves signed URLs) ----------
const idSchema = z.object({ id: z.string().uuid() });

export const getDiscoverChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => idSchema.parse(input))
  .handler(async ({ data, context }): Promise<DiscoverChatFull> => {
    const { data: row, error } = await context.supabase
      .from("discover_chats")
      .select("id, title, messages, created_at, updated_at")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error("APP-SYS-001: " + error.message);
    if (!row) throw new Error("APP-RCP-001: not found");

    const raw = Array.isArray(row.messages) ? (row.messages as StoredMessage[]) : [];
    const paths = Array.from(
      new Set(raw.map((m) => m.image_path).filter((p): p is string => !!p)),
    );
    const signedMap = new Map<string, string>();
    if (paths.length > 0) {
      const { data: signed } = await context.supabase.storage
        .from("chat-images")
        .createSignedUrls(paths, 60 * 60 * 24 * 7);
      (signed ?? []).forEach((s, i) => {
        if (s.signedUrl) signedMap.set(paths[i], s.signedUrl);
      });
    }

    const messages: ResolvedMessage[] = raw.map((m) => ({
      ...m,
      image_url: m.image_path ? signedMap.get(m.image_path) : undefined,
    }));

    return {
      id: row.id,
      title: row.title,
      messages,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });

// ---------- CREATE ----------
const createSchema = z.object({
  title: z.string().min(1).max(120).optional(),
});

export const createDiscoverChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createSchema.parse(input ?? {}))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const { data: row, error } = await context.supabase
      .from("discover_chats")
      .insert({
        user_id: context.userId,
        title: data.title ?? "Nuevo chat",
        messages: [],
      })
      .select("id")
      .single();
    if (error) throw new Error("APP-SYS-001: " + error.message);
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
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => appendSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error: readErr } = await context.supabase
      .from("discover_chats")
      .select("messages")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (readErr) throw new Error("APP-SYS-001: " + readErr.message);
    if (!row) throw new Error("APP-RCP-001: not found");

    const current = Array.isArray(row.messages) ? (row.messages as StoredMessage[]) : [];
    const next: StoredMessage[] = [
      ...current,
      { ...data.message, created_at: new Date().toISOString() },
    ];

    const { error } = await context.supabase
      .from("discover_chats")
      .update({ messages: next, updated_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error("APP-SYS-001: " + error.message);
    return { ok: true };
  });

// ---------- RENAME ----------
const renameSchema = z.object({ id: z.string().uuid(), title: z.string().min(1).max(120) });
export const renameDiscoverChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => renameSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("discover_chats")
      .update({ title: data.title })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error("APP-SYS-001: " + error.message);
    return { ok: true };
  });

// ---------- DELETE ----------
export const deleteDiscoverChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => idSchema.parse(input))
  .handler(async ({ data, context }) => {
    // Remove chat images first (best-effort).
    const { data: row } = await context.supabase
      .from("discover_chats")
      .select("messages")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    const paths = (row?.messages as StoredMessage[] | undefined)
      ?.map((m) => m.image_path)
      .filter((p): p is string => !!p);
    if (paths && paths.length > 0) {
      await context.supabase.storage.from("chat-images").remove(paths).catch(() => {});
    }
    const { error } = await context.supabase
      .from("discover_chats")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error("APP-SYS-001: " + error.message);
    return { ok: true };
  });

// ---------- UPLOAD IMAGE ----------
const uploadSchema = z.object({
  chatId: z.string().uuid(),
  base64: z.string().min(1),
  mime: z.string().default("image/jpeg"),
});

export const uploadChatImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => uploadSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ path: string }> => {
    const clean = data.base64.replace(/^data:[^;]+;base64,/, "");
    const bytes = Buffer.from(clean, "base64");
    if (bytes.length > 6 * 1024 * 1024) throw new Error("APP-FILE-002: image >6MB");

    const ext = data.mime.includes("png") ? "png" : "jpg";
    const path = `${context.userId}/${data.chatId}/${crypto.randomUUID()}.${ext}`;

    const { error } = await context.supabase.storage
      .from("chat-images")
      .upload(path, bytes, { contentType: data.mime, upsert: false });
    if (error) throw new Error("APP-SYS-001: " + error.message);
    return { path };
  });

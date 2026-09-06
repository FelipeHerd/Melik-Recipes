// Chef AI server functions — Vision-enabled chat via Lovable AI Gateway.
// Used by both /chef (FAB, ephemeral image) and /descubrir (persisted chat).
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const messageBlockSchema = z.union([
  z.object({ type: z.literal("text"), text: z.string() }),
  z.object({
    type: z.literal("image_url"),
    image_url: z.object({ url: z.string() }),
  }),
]);

const messageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.union([z.string(), z.array(messageBlockSchema)]),
});

const chatSchema = z.object({
  messages: z.array(messageSchema).min(1).max(50),
  systemPrompt: z.string().optional(),
  kind: z.enum(["chef", "discover"]).optional(),
});

function formatBlockedUntil(iso: string): string {
  try {
    return new Date(iso).toLocaleString("es-ES", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

async function assertKikoNotBlocked(
  supabase: {
    from: (t: string) => {
      select: (c: string) => {
        eq: (
          k: string,
          v: string,
        ) => { maybeSingle: () => Promise<{ data: { kiko_blocked_until: string | null } | null }> };
      };
    };
  },
  userId: string,
) {
  const { data } = await supabase
    .from("profiles")
    .select("kiko_blocked_until")
    .eq("id", userId)
    .maybeSingle();
  const until = data?.kiko_blocked_until;
  if (until && new Date(until) > new Date()) {
    throw new Error(
      `APP-AI-005: Kiko está en pausa para tu cuenta hasta ${formatBlockedUntil(until)}.`,
    );
  }
}

async function logAiUsage(userId: string, kind: "chef" | "discover" | "title") {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("ai_usage").insert({ user_id: userId, kind });
  } catch {
    // fire-and-forget: nunca bloquear la respuesta al usuario.
  }
}

export const chefChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => chatSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertKikoNotBlocked(
      context.supabase as unknown as Parameters<typeof assertKikoNotBlocked>[0],
      context.userId,
    );
    const { chatCompletion } = await import("./ai-gateway.server");
    const messages = data.systemPrompt
      ? [{ role: "system" as const, content: data.systemPrompt }, ...data.messages]
      : data.messages;
    try {
      const text = await chatCompletion({ messages });
      if (!text || typeof text !== "string") {
        throw new Error("APP-AI-003: empty completion");
      }
      void logAiUsage(context.userId, data.kind ?? "chef");
      return { text };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "AI_ERROR";
      // Preserve any APP-XXX-### already present; otherwise wrap as AI unavailable.
      if (/APP-[A-Z]+-\d{3}/.test(msg)) throw new Error(msg);
      throw new Error("APP-AI-002: " + msg);
    }
  });

const titleSchema = z.object({
  chatId: z.string().uuid(),
  firstUserMessage: z.string().min(1).max(2000),
  recentUserMessages: z.array(z.string().max(2000)).max(10).optional(),
});

const TRIVIAL_GREETINGS = new Set([
  "hola",
  "holi",
  "holis",
  "hey",
  "ey",
  "hi",
  "hello",
  "buenas",
  "buenos dias",
  "buenas tardes",
  "buenas noches",
  "saludos",
  "que tal",
  "que mas",
  "que hay",
  "que hubo",
  "que onda",
  "buen dia",
  "kiko",
  "hola kiko",
]);

function normalizeForGreeting(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[¡!¿?.,;:()"'`~^@#$%&*_\-+=/\\|<>{}\[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isTrivialOpener(text: string): boolean {
  const norm = normalizeForGreeting(text);
  if (!norm) return true;
  if (norm.length <= 20 && norm.split(" ").length <= 4) {
    if (TRIVIAL_GREETINGS.has(norm)) return true;
    // "hola kiko como estas", "buenas noches", etc.
    const firstWord = norm.split(" ")[0];
    if (TRIVIAL_GREETINGS.has(firstWord) && norm.split(" ").length <= 3) return true;
  }
  return false;
}

// Fire-and-forget from client. Generates a short title and updates the row.
// Returns { title: null, skipped: true } when the conversation is still
// trivial (a greeting only) so callers can retry on later turns.
export const generateChatTitle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => titleSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ title: string | null; skipped: boolean }> => {
    await assertKikoNotBlocked(
      context.supabase as unknown as Parameters<typeof assertKikoNotBlocked>[0],
      context.userId,
    );

    const userMessages = (data.recentUserMessages && data.recentUserMessages.length > 0)
      ? data.recentUserMessages
      : [data.firstUserMessage];

    // Cheap gate: single trivial opener → keep "Nuevo chat".
    if (userMessages.length <= 1 && isTrivialOpener(userMessages[0] ?? "")) {
      return { title: null, skipped: true };
    }

    const { chatCompletion } = await import("./ai-gateway.server");
    try {
      const joined = userMessages
        .map((m, i) => `[${i + 1}] ${m.slice(0, 400)}`)
        .join("\n")
        .slice(0, 1600);
      const raw = await chatCompletion({
        messages: [
          {
            role: "system",
            content:
              "Eres un asistente que genera un título muy corto (3-5 palabras, sin comillas ni punto final, en español) que resuma el tema culinario o repostero del que se habla en los mensajes del usuario. Si los mensajes son sólo saludos, cortesías o no tienen un tema claro todavía, responde EXACTAMENTE con la palabra: NUEVO_CHAT",
          },
          { role: "user", content: joined },
        ],
        max_tokens: 20,
      });
      const clean = raw.replace(/["'.\n]/g, "").trim();
      if (!clean || clean.toUpperCase().replace(/\s+/g, "_") === "NUEVO_CHAT") {
        return { title: null, skipped: true };
      }
      const title = clean.slice(0, 60);
      await context.supabase
        .from("discover_chats")
        .update({ title })
        .eq("id", data.chatId)
        .eq("user_id", context.userId);
      void logAiUsage(context.userId, "title");
      return { title, skipped: false };
    } catch {
      return { title: null, skipped: true };
    }
  });

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Send, Sparkles, ImageIcon, BookOpen, X } from "lucide-react";
import { showError } from "@/lib/errors/toast";
import { reportClientError } from "@/lib/error-reporting";
import { QueryErrorFallback } from "@/components/QueryErrorFallback";
import ReactMarkdown from "react-markdown";
import { ChatAttachMenu } from "@/components/ChatAttachMenu";
import { ChatRecipeAttachmentCard } from "@/components/ChatRecipeAttachmentCard";
import type { AttachedImage } from "@/components/ChatImageAttach";
import { TypingDots } from "@/components/TypingDots";
import { UserAvatarBubble } from "@/components/UserAvatarBubble";
import { DiscoverWelcome } from "@/components/DiscoverWelcome";
import {
  getDiscoverChat,
  uploadChatImage,
  appendDiscoverMessage,
  type DiscoverChatFull,
  type ResolvedMessage,
} from "@/lib/discover-chats.functions";
import { chefChat, generateChatTitle } from "@/lib/chef-ai.functions";
import { DISCOVERY_SYSTEM_PROMPT } from "@/lib/prompts";
import { extractRecipeDraft } from "@/lib/discover-recipe-parser";
import { RecipeDraftCard } from "@/components/RecipeDraftCard";
import { DiscoverChatSkeleton } from "@/components/DiscoverChatSkeleton";
import { DiscoverTabPill } from "@/components/DiscoverTabPill";
import { useRecipes } from "@/lib/recipes-context";
import { buildUserPromptWithRecipe, type AttachedRecipe } from "@/lib/recipe-context";
import { getOfficialRecipe } from "@/lib/official-recipes.functions";

export const Route = createFileRoute("/descubrir/$chatId")({
  // Warm the cache mientras el chunk termina de cargar → al llegar al render
  // useQuery ya tiene datos y el skeleton no parpadea.
  loader: ({ context, params }) => {
    void context.queryClient.prefetchQuery({
      queryKey: ["discover-chat", params.chatId],
      queryFn: () => getDiscoverChat({ data: { id: params.chatId } }),
    });
  },
  component: DescubrirChat,
});

function DescubrirChat() {
  const { chatId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const [image, setImage] = useState<AttachedImage | null>(null);
  const [attachedRecipe, setAttachedRecipe] = useState<AttachedRecipe | null>(null);
  const { recipes } = useRecipes();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const isFirstMessage = useRef<boolean>(false);
  const [liveAssistant, setLiveAssistant] = useState<ResolvedMessage | null>(null);

  const chatQuery = useQuery({
    queryKey: ["discover-chat", chatId],
    queryFn: () => getDiscoverChat({ data: { id: chatId } }),
    retry: false,
    refetchOnWindowFocus: false,
  });

  // Local mirror of the user message currently being sent. Kept independent of
  // the react-query cache so a mid-flight refetch (window focus, invalidate)
  // cannot wipe it before the assistant reply arrives.
  const [pendingUser, setPendingUser] = useState<ResolvedMessage | null>(null);

  useEffect(() => {
    setPendingUser(null);
    setLiveAssistant(null);
  }, [chatId]);

  // Query errors render inline via QueryErrorFallback (no toast spam).

  function scrollToEnd() {
    // rAF ensures layout has flushed after setQueryData / state changes.
    requestAnimationFrame(() => {
      endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    });
  }

  useEffect(() => {
    scrollToEnd();
  }, [chatQuery.data?.messages.length]);

  const sendMut = useMutation({
    mutationFn: async (opts: {
      text: string;
      image: AttachedImage | null;
      recipe: AttachedRecipe | null;
    }) => {
      const { text, image: img, recipe: recipeAtt } = opts;
      if (!text && !img && !recipeAtt) throw new Error("APP-CHAT-004: empty message");
      const current = chatQuery.data;
      if (!current) throw new Error("APP-CHAT-001: chat not loaded");
      isFirstMessage.current = current.messages.length === 0;

      let imagePath: string | undefined;
      if (img) {
        const { path } = await uploadChatImage({
          data: { chatId, base64: img.base64, mime: img.mime },
        });
        imagePath = path;
      }

      // Persist user message (clean text + chip metadata; recipe body is NOT
      // stored in the message — only injected into the LLM turn).
      await appendDiscoverMessage({
        data: {
          id: chatId,
          message: {
            role: "user",
            text,
            ...(imagePath ? { image_path: imagePath } : {}),
            ...(recipeAtt
              ? {
                  attached_recipe: {
                    id: recipeAtt.id,
                    title: recipeAtt.title,
                    source: recipeAtt.source,
                  },
                }
              : {}),
          },
        },
      });

      // Build history for LLM.
      const history = current.messages.map((m) => ({
        role: m.role,
        content: m.text || (m.image_path ? "[imagen adjunta]" : ""),
      }));

      // Invisible recipe injection for THIS turn only.
      let finalText = text;
      if (recipeAtt) {
        let ctx: Awaited<ReturnType<typeof getOfficialRecipe>> | (typeof recipes)[number] | null =
          null;
        if (recipeAtt.source === "mine") {
          ctx = recipes.find((r) => r.id === recipeAtt.id) ?? null;
        } else {
          try {
            ctx = await getOfficialRecipe({ data: { id: recipeAtt.id } });
          } catch (err) {
            showError(err, "APP-PERM-001");
          }
        }
        if (ctx) {
          finalText = buildUserPromptWithRecipe(text, {
            title: ctx.title,
            category: ctx.category,
            timeMinutes: ctx.timeMinutes,
            ingredients: ctx.ingredients,
            instructions: ctx.instructions,
          });
        }
      }

      const turnContent: Array<
        { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }
      > = [];
      if (finalText) turnContent.push({ type: "text", text: finalText });
      if (img) turnContent.push({ type: "image_url", image_url: { url: img.base64 } });

      const { text: reply } = await chefChat({
        data: {
          systemPrompt: DISCOVERY_SYSTEM_PROMPT,
          messages: [...history, { role: "user", content: turnContent }],
          kind: "discover",
        },
      });

      const assistantMessage: ResolvedMessage = {
        role: "assistant",
        text: reply,
        created_at: new Date().toISOString(),
      };

      // Paint Gemini's answer immediately when it arrives. Do not wait for the
      // DB append + query invalidation cycle, because that can leave the chat
      // visually stale until the next user turn.
      setLiveAssistant(assistantMessage);
      queryClient.setQueryData<DiscoverChatFull>(["discover-chat", chatId], (existing) =>
        existing ? appendMessageToCache(existing, assistantMessage) : existing,
      );
      scrollToEnd();

      await appendDiscoverMessage({
        data: { id: chatId, message: { role: "assistant", text: reply } },
      });

      // If the chat still has the default title, ask the server to try to
      // generate one from all the user messages so far. The server keeps
      // "Nuevo chat" while the conversation is only greetings.
      const currentTitle = chatQuery.data?.title ?? "Nuevo chat";
      if (currentTitle === "Nuevo chat") {
        const userMessages = (chatQuery.data?.messages ?? [])
          .filter((m) => m.role === "user")
          .map((m) => m.text ?? "")
          .filter(Boolean);
        userMessages.push(text || "Análisis de imagen");
        generateChatTitle({
          data: {
            chatId,
            firstUserMessage: userMessages[0] ?? (text || "Análisis de imagen"),
            recentUserMessages: userMessages.slice(-6),
          },
        })
          .then((res) => {
            if (res && !res.skipped) {
              queryClient.invalidateQueries({ queryKey: ["discover-chats"] });
              queryClient.invalidateQueries({ queryKey: ["discover-chat", chatId] });
            }
          })
          .catch((err) => reportClientError(err, { context: "generateChatTitle-cleanup" }));
      }

      return assistantMessage;
    },
    onMutate: async (opts) => {
      // Optimistic: show user bubble instantly.
      const key = ["discover-chat", chatId];
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<DiscoverChatFull>(key);
      if (previous) {
        const optimistic: ResolvedMessage = {
          role: "user",
          text: opts.text,
          created_at: new Date().toISOString(),
          ...(opts.image ? { image_url: opts.image.previewUrl } : {}),
          ...(opts.recipe
            ? {
                attached_recipe: {
                  id: opts.recipe.id,
                  title: opts.recipe.title,
                  source: opts.recipe.source,
                },
              }
            : {}),
        };
        setPendingUser(optimistic);
        queryClient.setQueryData<DiscoverChatFull>(key, {
          ...previous,
          messages: [...previous.messages, optimistic],
        });
      } else {
        setPendingUser({
          role: "user",
          text: opts.text,
          created_at: new Date().toISOString(),
          ...(opts.image ? { image_url: opts.image.previewUrl } : {}),
          ...(opts.recipe
            ? {
                attached_recipe: {
                  id: opts.recipe.id,
                  title: opts.recipe.title,
                  source: opts.recipe.source,
                },
              }
            : {}),
        });
      }
      setLiveAssistant(null);
      setInput("");
      setImage(null);
      setAttachedRecipe(null);
      scrollToEnd();
      return { previous };
    },
    onSuccess: (assistantMessage) => {
      queryClient.setQueryData<DiscoverChatFull>(["discover-chat", chatId], (existing) =>
        existing ? appendMessageToCache(existing, assistantMessage) : existing,
      );
      void queryClient.invalidateQueries({ queryKey: ["discover-chats"] });
      setPendingUser(null);
      setLiveAssistant(null);
      scrollToEnd();
    },
    onError: (e, _vars, ctx) => {
      // Roll back optimistic update.
      if (ctx?.previous) {
        queryClient.setQueryData(["discover-chat", chatId], ctx.previous);
      }
      setPendingUser(null);
      setLiveAssistant(null);
      showError(e, "APP-AI-002");
    },
  });

  function handleSend() {
    const text = input.trim();
    if (sendMut.isPending) return;
    if (!text && !image && !attachedRecipe) return;
    sendMut.mutate({ text, image, recipe: attachedRecipe });
  }

  const disabled = sendMut.isPending || (!input.trim() && !image && !attachedRecipe);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-4 pt-2 md:px-6">
        <DiscoverTabPill tab="kiko" />
      </div>
      <div
        ref={scrollerRef}
        className="mt-3 flex flex-1 flex-col overflow-y-auto overscroll-contain p-4 md:p-6 [mask-image:linear-gradient(to_bottom,transparent_0,black_1.25rem)] [-webkit-mask-image:linear-gradient(to_bottom,transparent_0,black_1.25rem)]"
      >
        {chatQuery.isPending ? (
          <DiscoverChatSkeleton />
        ) : chatQuery.isError ? (
          <div className="flex flex-1 items-center justify-center p-6">
            <QueryErrorFallback
              error={chatQuery.error}
              hint="APP-CHAT-001"
              onRetry={() => {
                void chatQuery.refetch();
                navigate({ to: "/descubrir" });
              }}
            />
          </div>
        ) : chatQuery.data && chatQuery.data.messages.length === 0 && !sendMut.isPending ? (
          <DiscoverWelcome key={chatId} />
        ) : (
          (() => {
            const serverMsgs = chatQuery.data?.messages ?? [];
            // Guarantee the in-flight user message stays visible even if a
            // refetch replaced the optimistic cache mid-turn.
            const showPending =
              pendingUser &&
              !serverMsgs.some(
                (m) =>
                  m.role === "user" &&
                  m.text === pendingUser.text &&
                  m.created_at >= pendingUser.created_at,
              );
            const showLiveAssistant =
              liveAssistant &&
              !serverMsgs.some((m) => m.role === "assistant" && m.text === liveAssistant.text);
            return (
              <div className="flex flex-col gap-4">
                {serverMsgs.map((m, i) => (
                  <Bubble key={i} message={m} />
                ))}
                {showPending && pendingUser && <Bubble key="pending-user" message={pendingUser} />}
                {showLiveAssistant && liveAssistant && (
                  <Bubble key="live-assistant" message={liveAssistant} />
                )}
                {sendMut.isPending && !liveAssistant && (
                  <Bubble message={{ role: "assistant", text: "", created_at: "" }} thinking />
                )}
                <div ref={endRef} />
              </div>
            );
          })()
        )}
      </div>

      <div className="relative m-3 rounded-3xl border border-border bg-background p-2 shadow-sm">
        {(image || attachedRecipe) && (
          <div className="flex flex-wrap items-center gap-2 px-2 pb-2 pt-1">
            {image && (
              <div className="inline-flex items-center gap-2 rounded-2xl border border-border bg-card p-1 pr-2">
                <img
                  src={image.previewUrl}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="h-9 w-9 rounded-xl object-cover"
                />
                <span className="text-xs text-muted-foreground">Imagen</span>
                <button
                  type="button"
                  onClick={() => setImage(null)}
                  aria-label="Quitar imagen"
                  className="grid h-6 w-6 place-items-center rounded-full hover:bg-muted"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}
            {attachedRecipe && (
              <div className="inline-flex max-w-[220px] items-center gap-2 rounded-2xl border border-primary/40 bg-primary/5 px-2.5 py-1.5">
                <BookOpen className="h-3.5 w-3.5 flex-none text-primary" />
                <span className="truncate text-xs font-medium text-foreground">
                  {attachedRecipe.title}
                </span>
                <button
                  type="button"
                  onClick={() => setAttachedRecipe(null)}
                  aria-label="Quitar receta"
                  className="grid h-5 w-5 flex-none place-items-center rounded-full hover:bg-primary/10"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
        )}
        <div className="flex items-end gap-2">
          <ChatAttachMenu
            onImage={setImage}
            onRecipe={setAttachedRecipe}
            disabled={sendMut.isPending}
          />
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            rows={1}
            placeholder="Pregúntale a Kiko…"
            className="max-h-40 min-h-11 flex-1 resize-none rounded-2xl bg-transparent px-3 py-3 text-sm focus:outline-none"
            disabled={sendMut.isPending}
          />
          <button
            type="button"
            // Prevent stealing focus from the textarea on mobile.
            onPointerDown={(e) => e.preventDefault()}
            onClick={handleSend}
            disabled={disabled}
            className="grid h-11 w-11 flex-none place-items-center rounded-2xl bg-primary text-primary-foreground transition hover:bg-primary/90 disabled:opacity-40"
            aria-label="Enviar"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function appendMessageToCache(chat: DiscoverChatFull, message: ResolvedMessage): DiscoverChatFull {
  const last = chat.messages.at(-1);
  const exists =
    (last?.role === message.role && last.text === message.text) ||
    chat.messages.some(
      (m) =>
        m.role === message.role && m.text === message.text && m.created_at === message.created_at,
    );
  if (exists) return chat;
  return {
    ...chat,
    messages: [...chat.messages, message],
    updatedAt: message.created_at || chat.updatedAt,
  };
}

function Bubble({ message, thinking }: { message: ResolvedMessage; thinking?: boolean }) {
  const isUser = message.role === "user";
  const { cleanText, draft } =
    !thinking && !isUser
      ? extractRecipeDraft(message.text)
      : { cleanText: message.text, draft: null };
  const hasBubbleContent =
    thinking ||
    !!message.image_url ||
    (!message.image_url && !!message.image_path) ||
    !!cleanText ||
    (!!draft && !isUser);
  return (
    <div className={`flex items-start gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      {isUser ? (
        <UserAvatarBubble />
      ) : (
        <span className="grid h-9 w-9 flex-none place-items-center rounded-2xl bg-primary text-primary-foreground">
          <Sparkles className="h-4 w-4" />
        </span>
      )}
      <div className={`flex max-w-[85%] flex-col gap-2 ${isUser ? "items-end" : "items-start"}`}>
        {hasBubbleContent && (
          <div
            className={`rounded-3xl px-4 py-3 text-sm ${
              isUser ? "bg-[color:var(--ochre)]/25" : "bg-card"
            } ${!isUser && !thinking ? "origin-top-left animate-in fade-in-0 zoom-in-95 duration-300 ease-out" : ""}`}
          >
            {message.image_url && (
              <img
                src={message.image_url}
                alt="Adjunto"
                loading="lazy"
                decoding="async"
                className="mb-2 max-h-56 w-auto rounded-2xl object-cover"
              />
            )}
            {!message.image_url && message.image_path && (
              <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                <ImageIcon className="h-3 w-3" /> imagen adjunta
              </div>
            )}
            {thinking ? (
              <TypingDots />
            ) : (
              <div
                className={
                  !isUser
                    ? "animate-in fade-in-0 duration-500 [animation-delay:180ms] fill-mode-backwards"
                    : ""
                }
              >
                {cleanText && (
                  <div className="prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1">
                    <ReactMarkdown>{cleanText}</ReactMarkdown>
                  </div>
                )}
                {draft && <RecipeDraftCard draft={draft} />}
              </div>
            )}
          </div>
        )}
        {message.attached_recipe && <ChatRecipeAttachmentCard attached={message.attached_recipe} />}
      </div>
    </div>
  );
}

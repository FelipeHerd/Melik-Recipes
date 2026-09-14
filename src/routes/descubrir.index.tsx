import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, Suspense, lazy } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Send, Sparkles, ImageIcon, BookOpen, X } from "lucide-react";
import { showError } from "@/lib/errors/toast";
import { reportClientError } from "@/lib/error-reporting";
import { ChatAttachMenu } from "@/components/ChatAttachMenu";
import { ChatRecipeAttachmentCard } from "@/components/ChatRecipeAttachmentCard";
import type { AttachedImage } from "@/components/ChatImageAttach";
import { TypingDots } from "@/components/TypingDots";
import { UserAvatarBubble } from "@/components/UserAvatarBubble";
import { DiscoverWelcome } from "@/components/DiscoverWelcome";
import { CommunityFeedSkeleton } from "@/components/CommunityFeedSkeleton";
import { DiscoverTabPill } from "@/components/DiscoverTabPill";
import ReactMarkdown from "react-markdown";
import {
  createDiscoverChat,
  uploadChatImage,
  appendDiscoverMessage,
  type DiscoverChatFull,
  type ResolvedMessage,
} from "@/lib/discover-chats.functions";
import { chefChat, generateChatTitle } from "@/lib/chef-ai.functions";
import { DISCOVERY_SYSTEM_PROMPT } from "@/lib/prompts";
import { useRecipes } from "@/lib/recipes-context";
import { buildUserPromptWithRecipe, type AttachedRecipe } from "@/lib/recipe-context";
import { getOfficialRecipe } from "@/lib/official-recipes.functions";
import { extractRecipeDraft } from "@/lib/discover-recipe-parser";
import { RecipeDraftCard } from "@/components/RecipeDraftCard";

// Lazy: el feed de Comunidad no se descarga hasta que el usuario cambia de tab.
// Aligera el chunk inicial de /descubrir (Kiko es la vista por defecto).
const CommunityFeed = lazy(() =>
  import("@/components/CommunityFeed").then((m) => ({ default: m.CommunityFeed })),
);

export const Route = createFileRoute("/descubrir/")({
  component: DescubrirIndex,
});

type Pending = {
  text: string;
  imageUrl: string | null;
  recipe: AttachedRecipe | null;
};

function DescubrirIndex() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const search = Route.useSearch();
  const tab: "kiko" | "comunidad" = search.tab === "comunidad" ? "comunidad" : "kiko";
  const [input, setInput] = useState("");
  const [image, setImage] = useState<AttachedImage | null>(null);
  const [attachedRecipe, setAttachedRecipe] = useState<AttachedRecipe | null>(null);
  const { recipes } = useRecipes();
  // Local optimistic preview shown while the chat is being created.
  const [pending, setPending] = useState<Pending | null>(null);
  const [pendingAssistant, setPendingAssistant] = useState<ResolvedMessage | null>(null);

  const startMut = useMutation({
    mutationFn: async (opts: {
      text: string;
      image: AttachedImage | null;
      recipe: AttachedRecipe | null;
    }) => {
      const { text, image: img, recipe: recipeAtt } = opts;
      if (!text && !img && !recipeAtt) throw new Error("APP-CHAT-004: empty message");

      // 1. Create chat
      const { id } = await createDiscoverChat({ data: {} });

      // Seed the destination chat cache immediately.
      const optimisticUserMsg: ResolvedMessage = {
        role: "user",
        text,
        created_at: new Date().toISOString(),
        ...(img ? { image_url: img.previewUrl } : {}),
        ...(recipeAtt
          ? {
              attached_recipe: {
                id: recipeAtt.id,
                title: recipeAtt.title,
                source: recipeAtt.source,
              },
            }
          : {}),
      };
      const nowIso = new Date().toISOString();
      const seed: DiscoverChatFull = {
        id,
        title: "Nuevo chat",
        messages: [optimisticUserMsg],
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      queryClient.setQueryData(["discover-chat", id], seed);

      // 2. Upload image (if any)
      let imagePath: string | undefined;
      if (img) {
        const { path } = await uploadChatImage({
          data: { chatId: id, base64: img.base64, mime: img.mime },
        });
        imagePath = path;
      }

      // 3. Persist user message
      await appendDiscoverMessage({
        data: {
          id,
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

      // 4. Build LLM payload with invisible recipe injection.
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

      const content: Array<
        { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }
      > = [];
      if (finalText) content.push({ type: "text", text: finalText });
      if (img) content.push({ type: "image_url", image_url: { url: img.base64 } });

      const { text: reply } = await chefChat({
        data: {
          systemPrompt: DISCOVERY_SYSTEM_PROMPT,
          messages: [{ role: "user", content }],
          kind: "discover",
        },
      });

      const assistantMessage: ResolvedMessage = {
        role: "assistant",
        text: reply,
        created_at: new Date().toISOString(),
      };
      setPendingAssistant(assistantMessage);
      queryClient.setQueryData<DiscoverChatFull>(["discover-chat", id], (existing) =>
        existing ? appendMessageToCache(existing, assistantMessage) : existing,
      );

      // 5. Persist assistant
      await appendDiscoverMessage({
        data: { id, message: { role: "assistant", text: reply } },
      });

      queryClient.setQueryData<DiscoverChatFull>(["discover-chat", id], (existing) =>
        existing ? appendMessageToCache(existing, assistantMessage) : existing,
      );

      // 6. Fire-and-forget title. Server decides whether the opener is
      // trivial (returns skipped=true, we keep "Nuevo chat"). Later turns
      // retry from the $chatId route once the topic surfaces.
      generateChatTitle({
        data: {
          chatId: id,
          firstUserMessage: text || "Análisis de imagen",
          recentUserMessages: [text || "Análisis de imagen"],
        },
      })
        .then((res) => {
          if (res && !res.skipped) {
            queryClient.invalidateQueries({ queryKey: ["discover-chats"] });
          }
        })
        .catch((err) => reportClientError(err, { context: "generateChatTitle-cleanup" }));

      return id;
    },
    onMutate: (opts) => {
      setPending({
        text: opts.text,
        imageUrl: opts.image?.previewUrl ?? null,
        recipe: opts.recipe,
      });
      setPendingAssistant(null);
      setInput("");
      setImage(null);
      setAttachedRecipe(null);
    },
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({ queryKey: ["discover-chats"] });
      navigate({ to: "/descubrir/$chatId", params: { chatId: id } });
    },
    onError: (e) => {
      setPending(null);
      setPendingAssistant(null);
      showError(e, "APP-AI-002");
    },
  });

  function handleSend() {
    const text = input.trim();
    if (startMut.isPending) return;
    if (!text && !image && !attachedRecipe) return;
    startMut.mutate({ text, image, recipe: attachedRecipe });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-4 pt-2 md:px-6">
        <DiscoverTabPill tab={tab} />
      </div>

      {tab === "comunidad" ? (
        <div className="mt-3 flex-1 overflow-y-auto [mask-image:linear-gradient(to_bottom,transparent_0,black_1.25rem)] [-webkit-mask-image:linear-gradient(to_bottom,transparent_0,black_1.25rem)]">
          <Suspense fallback={<CommunityFeedSkeleton />}>
            <CommunityFeed />
          </Suspense>
        </div>
      ) : (
        <>
          <div className="mt-3 flex flex-1 flex-col overflow-y-auto [mask-image:linear-gradient(to_bottom,transparent_0,black_1.25rem)] [-webkit-mask-image:linear-gradient(to_bottom,transparent_0,black_1.25rem)]">
            {pending ? (
              <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">
                <div className="flex items-start gap-3 flex-row-reverse">
                  <UserAvatarBubble />
                  <div className="flex max-w-[85%] flex-col items-end gap-2">
                    {(pending.imageUrl || pending.text || !pending.recipe) && (
                      <div className="rounded-3xl bg-[color:var(--ochre)]/25 px-4 py-3 text-sm">
                        {pending.imageUrl && (
                          <img
                            src={pending.imageUrl}
                            alt="Adjunto"
                            loading="lazy"
                            decoding="async"
                            className="mb-2 max-h-56 w-auto rounded-2xl object-cover"
                          />
                        )}
                        {!pending.imageUrl && !pending.text && !pending.recipe && (
                          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                            <ImageIcon className="h-3 w-3" /> imagen adjunta
                          </div>
                        )}
                        {pending.text && <p className="whitespace-pre-wrap">{pending.text}</p>}
                      </div>
                    )}
                    {pending.recipe && <ChatRecipeAttachmentCard attached={pending.recipe} />}
                  </div>
                </div>
                {pendingAssistant ? (
                  <AssistantBubble message={pendingAssistant} />
                ) : (
                  <div className="flex items-start gap-3">
                    <span className="grid h-9 w-9 flex-none place-items-center rounded-2xl bg-primary text-primary-foreground">
                      <Sparkles className="h-4 w-4" />
                    </span>
                    <div className="max-w-[85%] rounded-3xl bg-card px-4 py-3 text-sm">
                      <TypingDots />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <DiscoverWelcome key="index" />
            )}
          </div>

          <ChatInputBar
            input={input}
            setInput={setInput}
            image={image}
            setImage={setImage}
            attachedRecipe={attachedRecipe}
            setAttachedRecipe={setAttachedRecipe}
            onSend={handleSend}
            loading={startMut.isPending}
          />
        </>
      )}
    </div>
  );
}

function AssistantBubble({ message }: { message: ResolvedMessage }) {
  const { cleanText, draft } = extractRecipeDraft(message.text);

  return (
    <div className="flex items-start gap-3">
      <span className="grid h-9 w-9 flex-none place-items-center rounded-2xl bg-primary text-primary-foreground">
        <Sparkles className="h-4 w-4" />
      </span>
      <div className="flex max-w-[85%] flex-col items-start gap-2">
        <div className="rounded-3xl bg-card px-4 py-3 text-sm">
          {cleanText && (
            <div className="prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1">
              <ReactMarkdown>{cleanText}</ReactMarkdown>
            </div>
          )}
          {draft && <RecipeDraftCard draft={draft} />}
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

function ChatInputBar({
  input,
  setInput,
  image,
  setImage,
  attachedRecipe,
  setAttachedRecipe,
  onSend,
  loading,
}: {
  input: string;
  setInput: (v: string) => void;
  image: AttachedImage | null;
  setImage: (i: AttachedImage | null) => void;
  attachedRecipe: AttachedRecipe | null;
  setAttachedRecipe: (r: AttachedRecipe | null) => void;
  onSend: () => void;
  loading: boolean;
}) {
  const disabled = loading || (!input.trim() && !image && !attachedRecipe);
  return (
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
        <ChatAttachMenu onImage={setImage} onRecipe={setAttachedRecipe} disabled={loading} />
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (!disabled) onSend();
            }
          }}
          rows={1}
          placeholder="Pregúntale a Kiko…"
          className="max-h-40 min-h-11 flex-1 resize-none rounded-2xl bg-transparent px-3 py-3 text-sm focus:outline-none"
          disabled={loading}
        />
        <button
          type="button"
          onPointerDown={(e) => e.preventDefault()}
          onClick={onSend}
          disabled={disabled}
          className="grid h-11 w-11 flex-none place-items-center rounded-2xl bg-primary text-primary-foreground transition hover:bg-primary/90 disabled:opacity-40"
          aria-label="Enviar"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

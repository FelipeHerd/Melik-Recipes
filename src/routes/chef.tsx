import { createFileRoute, Link, useSearch, useRouter } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  Send,
  Sparkles,
  ChefHat,
  X,
  CheckCircle2,
  Circle,
  Lock,
  ArrowLeft,
  RotateCcw,
  BookOpen,
  Mic,
} from "lucide-react";
import { useKikoVoice } from "@/hooks/use-kiko-voice";
import { VoiceCallBar } from "@/components/chef/VoiceCallBar";
import { VoiceLimitModal } from "@/components/chef/VoiceLimitModal";
import { KikoVoicePaywallModal } from "@/components/KikoVoicePaywallModal";

import { useIsMobile } from "@/hooks/use-mobile";

import { useRecipes, type Recipe } from "@/lib/recipes-context";
import { useProfile } from "@/lib/use-profile";
import { useSessionUser } from "@/components/UserMenu";
import { ChatAttachMenu } from "@/components/ChatAttachMenu";
import { ChatRecipeAttachmentCard } from "@/components/ChatRecipeAttachmentCard";
import type { AttachedImage } from "@/components/ChatImageAttach";
import { chefChat } from "@/lib/chef-ai.functions";
import { CHEF_PERSONAL_SYSTEM_PROMPT } from "@/lib/prompts";
import {
  buildUserPromptWithRecipe,
  formatRecipeForLLM,
  type AttachedRecipe,
} from "@/lib/recipe-context";
import { getOfficialRecipe } from "@/lib/official-recipes.functions";
import { toast } from "sonner";
import { showError } from "@/lib/errors/toast";
import { z } from "zod";
import { TypingDots } from "@/components/TypingDots";
import { UserAvatarBubble } from "@/components/UserAvatarBubble";
import { UserMenu } from "@/components/UserMenu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const searchSchema = z.object({
  recipeId: z.string().optional(),
  voice: z.coerce.boolean().optional(),
});

export const Route = createFileRoute("/chef")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Kiko — Cocina con IA | Melik Recipes" },
      {
        name: "description",
        content:
          "Chatea con Kiko, un asistente IA que reconoce ingredientes y te guía paso a paso por cada receta.",
      },
      { property: "og:title", content: "Kiko — Cocina con IA" },
      {
        property: "og:description",
        content:
          "Chatea con Kiko, un asistente IA que reconoce ingredientes y te guía paso a paso.",
      },
      { property: "og:url", content: "https://melik-recipes.lovable.app/chef" },
    ],
    links: [{ rel: "canonical", href: "https://melik-recipes.lovable.app/chef" }],
  }),
  component: ChefPage,
});

type TextMsg = {
  id: string;
  role: "user" | "assistant";
  type: "text";
  content: string;
  attachedRecipe?: AttachedRecipe;
  voice?: boolean;
};
type WizardMsg = { id: string; role: "assistant"; type: "wizard"; recipeId: string };
type Msg = TextMsg | WizardMsg;

type ChefMemory = {
  mentionedIngredients: string[];
  suggestedRecipeIds: string[];
  activeRecipeId: string | null;
  activeStepIndex: number;
  doneSteps: Record<string, number[]>; // recipeId -> indices done
  lastIntent: "suggest" | "guide" | "answer" | "progress" | null;
};

const SESSION_KEY = "meliks.chef.session.v1";

const INGREDIENT_VOCAB = [
  "tomate",
  "queso",
  "mozzarella",
  "huevo",
  "huevos",
  "harina",
  "leche",
  "pollo",
  "arroz",
  "pasta",
  "cebolla",
  "ajo",
  "albahaca",
  "carne",
  "atún",
  "papa",
  "papas",
  "zanahoria",
  "espinaca",
  "lechuga",
  "limón",
  "manzana",
  "plátano",
  "avena",
  "mantequilla",
  "azúcar",
  "sal",
  "pimienta",
  "aceite",
  "pan",
  "jamón",
];

const QUICK_ACTIONS = [
  "Tengo tomate, queso y huevo. ¿Qué cocinamos de mi recetario?",
  "Guíame paso a paso en la receta más rápida de mis guardados.",
];

const emptyMemory: ChefMemory = {
  mentionedIngredients: [],
  suggestedRecipeIds: [],
  activeRecipeId: null,
  activeStepIndex: 0,
  doneSteps: {},
  lastIntent: null,
};

function loadSession(): { messages: Msg[]; memory: ChefMemory } {
  if (typeof window === "undefined") return { messages: [], memory: emptyMemory };
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) return { messages: [], memory: emptyMemory };
    const parsed = JSON.parse(raw);
    return {
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
      memory: { ...emptyMemory, ...(parsed.memory ?? {}) },
    };
  } catch {
    return { messages: [], memory: emptyMemory };
  }
}

function extractIngredients(text: string): string[] {
  const lower = text.toLowerCase();
  return INGREDIENT_VOCAB.filter((w) => new RegExp(`\\b${w}\\b`, "i").test(lower));
}

function getSteps(recipe: Recipe): string[] {
  return recipe.instructions.map((s) => s.text.trim()).filter(Boolean);
}

function ChefPage() {
  const { recipes } = useRecipes();
  const { recipeId, voice: autoVoice } = useSearch({ from: "/chef" });
  const navigate = Route.useNavigate();
  const router = useRouter();

  const initial = useMemo(() => loadSession(), []);
  const [messages, setMessages] = useState<Msg[]>(initial.messages);
  const [memory, setMemory] = useState<ChefMemory>(initial.memory);
  const [input, setInput] = useState("");

  const [thinking, setThinking] = useState(false);
  const [image, setImage] = useState<AttachedImage | null>(null);
  const [attachedRecipe, setAttachedRecipe] = useState<AttachedRecipe | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { userId, ready: sessionReady } = useSessionUser();
  const { profile, isLoading: profileLoading, isAuthenticated, isPremium } = useProfile();

  // Persist session
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(SESSION_KEY, JSON.stringify({ messages, memory }));
    } catch {
      // ignore
    }
  }, [messages, memory]);

  const isMobile = useIsMobile();
  useEffect(() => {
    // Only auto-focus on desktop; on mobile we keep the keyboard closed
    // and remove any visual focus from the input/buttons so the screen looks
    // clean on entry. The user can tap the input to start typing.
    if (!isMobile) {
      inputRef.current?.focus();
    } else {
      inputRef.current?.blur();
      if (typeof document !== "undefined") {
        (document.activeElement as HTMLElement | null)?.blur();
      }
    }
  }, [isMobile]);

  // Detect virtual keyboard on mobile via visualViewport
  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return;
    const check = () => {
      const vv = window.visualViewport!;
      setKeyboardOpen(window.innerHeight - vv.height > 120);
    };
    window.visualViewport.addEventListener("resize", check);
    check();
    return () => window.visualViewport!.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, thinking]);

  const startWizard = useCallback((r: Recipe) => {
    setMemory((m) => ({
      ...m,
      activeRecipeId: r.id,
      activeStepIndex: 0,
      doneSteps: { ...m.doneSteps, [r.id]: m.doneSteps[r.id] ?? [] },
      lastIntent: "guide",
    }));
    setMessages((m) => [
      ...m,
      {
        id: crypto.randomUUID(),
        role: "assistant",
        type: "text",
        content: `¡Perfecto! Vamos a cocinar **${r.title}** juntos. Te guío paso a paso 👇 Dime "siguiente" cuando termines cada paso.`,
      },
      { id: crypto.randomUUID(), role: "assistant", type: "wizard", recipeId: r.id },
    ]);
  }, []);

  useEffect(() => {
    if (recipeId) {
      const r = recipes.find((x) => x.id === recipeId);
      if (r && memory.activeRecipeId !== r.id) startWizard(r);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipeId]);

  function pushAssistant(text: string) {
    setMessages((m) => [
      ...m,
      { id: crypto.randomUUID(), role: "assistant", type: "text", content: text },
    ]);
  }

  function findRecipeReference(text: string): Recipe | null {
    const lower = text.toLowerCase();
    const direct = recipes.find((r) => lower.includes(r.title.toLowerCase()));
    if (direct) return direct;
    const ordinalMatch = lower.match(/\b(primera|segunda|tercera|1|2|3|esa|la anterior)\b/);
    if (ordinalMatch && memory.suggestedRecipeIds.length > 0) {
      const idx =
        { primera: 0, "1": 0, segunda: 1, "2": 1, tercera: 2, "3": 2 }[ordinalMatch[1] as string] ??
        0;
      const id = memory.suggestedRecipeIds[idx] ?? memory.suggestedRecipeIds[0];
      return recipes.find((r) => r.id === id) ?? null;
    }
    return null;
  }

  function generateReply(userText: string) {
    const lower = userText.toLowerCase();
    const newIngredients = extractIngredients(userText);
    const mergedIngredients = Array.from(
      new Set([...memory.mentionedIngredients, ...newIngredients]),
    );

    // Intent: progress in active wizard
    const progressRegex = /\b(siguiente|listo|hecho|ya está|ya esta|continuar|próximo|proximo)\b/;
    if (memory.activeRecipeId && progressRegex.test(lower)) {
      const recipe = recipes.find((r) => r.id === memory.activeRecipeId);
      if (recipe) {
        const steps = getSteps(recipe);
        const idx = memory.activeStepIndex;
        const nextIdx = Math.min(idx + 1, steps.length);
        const prevDone = memory.doneSteps[recipe.id] ?? [];
        const updatedDone = Array.from(new Set([...prevDone, idx]));
        setMemory((m) => ({
          ...m,
          mentionedIngredients: mergedIngredients,
          activeStepIndex: nextIdx,
          doneSteps: { ...m.doneSteps, [recipe.id]: updatedDone },
          lastIntent: "progress",
        }));
        if (nextIdx >= steps.length) {
          pushAssistant(
            `¡Terminaste **${recipe.title}**! 🎉 ¿Quieres que te sugiera un postre o guardamos otra para luego?`,
          );
        } else {
          pushAssistant(
            `Paso ${nextIdx + 1} de ${steps.length}:\n\n**${steps[nextIdx]}**\n\nAvísame cuando esté listo.`,
          );
        }
        return;
      }
    }

    // Intent: guide on a referenced recipe
    if (/\b(guiar|guíame|guiame|cocinar|cocinemos|hagamos|paso a paso)\b/.test(lower)) {
      const r = findRecipeReference(userText) ?? recipes[0];
      if (r) {
        setMemory((m) => ({ ...m, mentionedIngredients: mergedIngredients, lastIntent: "guide" }));
        startWizard(r);
        return;
      }
    }

    // Intent: suggest based on ingredients (uses memory!)
    if (
      newIngredients.length > 0 ||
      /\b(tengo|sugerir|sugiere|qué cocino|que cocino|ideas?)\b/.test(lower)
    ) {
      const ing = mergedIngredients;
      const matches = recipes
        .map((r) => {
          const ingText = r.ingredients
            .map((i) => `${i.quantity} ${i.unit} ${i.name}`)
            .join(" ")
            .toLowerCase();
          const hits = ing.filter((w) => ingText.includes(w)).length;
          return { r, hits };
        })
        .filter((x) => x.hits > 0)
        .sort((a, b) => b.hits - a.hits)
        .slice(0, 3);

      const suggested = matches.map((x) => x.r);
      setMemory((m) => ({
        ...m,
        mentionedIngredients: mergedIngredients,
        suggestedRecipeIds: suggested.map((r) => r.id),
        lastIntent: "suggest",
      }));

      if (suggested.length > 0) {
        const list = suggested
          .map((r, i) => `${i + 1}. **${r.title}** (${r.timeMinutes} min)`)
          .join("\n");
        const ingTxt = ing.length ? ` con ${ing.join(", ")}` : "";
        pushAssistant(
          `Recordando lo que mencionaste${ingTxt}, de tus recetas guardadas te recomiendo:\n\n${list}\n\nDime "guíame con la primera" y empezamos.`,
        );
      } else {
        pushAssistant(
          `Anoté: ${ing.join(", ") || "ingredientes"}. No tengo una receta guardada exacta, pero podrías hacer una **tortilla rápida** o una **ensalada fresca**. ¿Quieres que te guíe paso a paso?`,
        );
      }
      return;
    }

    // Fallback contextual reply
    setMemory((m) => ({ ...m, mentionedIngredients: mergedIngredients, lastIntent: "answer" }));
    if (memory.activeRecipeId) {
      const recipe = recipes.find((r) => r.id === memory.activeRecipeId);
      pushAssistant(
        `Estamos cocinando **${recipe?.title}**. Si tienes dudas sobre el paso actual, pregúntame, o dime "siguiente" para continuar.`,
      );
    } else if (memory.suggestedRecipeIds.length > 0) {
      pushAssistant(
        `Te propuse algunas recetas arriba. ¿Quieres que te guíe en una? Puedes decir "la primera" o el nombre.`,
      );
    } else {
      pushAssistant(
        `Cuéntame qué ingredientes tienes o pídeme que te guíe en una receta guardada. Tienes ${recipes.length} guardadas.`,
      );
    }
  }

  function buildSystemPrompt(): string {
    const catalogo = recipes
      .slice(0, 30)
      .map((r) => `- ${r.title} (${r.category || "sin categoría"}, ${r.timeMinutes} min)`)
      .join("\n");
    return `${CHEF_PERSONAL_SYSTEM_PROMPT}\n\nCatálogo de recetas guardadas del usuario:\n${catalogo || "(sin recetas guardadas todavía)"}`;
  }

  async function callLlm(
    userText: string,
    img: AttachedImage | null,
    recipeAttachment: AttachedRecipe | null,
  ): Promise<string> {
    const history = messages
      .filter((m): m is TextMsg => m.type === "text")
      .slice(-8)
      .map((m) => ({ role: m.role, content: m.content }));

    // Invisible recipe context injection: only for this turn. History stays clean.
    let finalText = userText;
    if (recipeAttachment) {
      let recipeCtx: Recipe | Awaited<ReturnType<typeof getOfficialRecipe>> | null = null;
      if (recipeAttachment.source === "mine") {
        recipeCtx = recipes.find((r) => r.id === recipeAttachment.id) ?? null;
      } else {
        try {
          recipeCtx = await getOfficialRecipe({ data: { id: recipeAttachment.id } });
        } catch (err) {
          showError(err, "APP-PERM-001");
        }
      }
      if (recipeCtx) {
        finalText = buildUserPromptWithRecipe(userText, {
          title: recipeCtx.title,
          category: recipeCtx.category,
          timeMinutes: recipeCtx.timeMinutes,
          ingredients: recipeCtx.ingredients,
          instructions: recipeCtx.instructions,
        });
      }
    }

    const content: Array<
      { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }
    > = [];
    if (finalText) content.push({ type: "text", text: finalText });
    if (img) content.push({ type: "image_url", image_url: { url: img.base64 } });
    const { text } = await chefChat({
      data: {
        systemPrompt: buildSystemPrompt(),
        messages: [...history, { role: "user", content }],
      },
    });
    return text;
  }

  async function send() {
    const text = input.trim();
    if (!text && !image && !attachedRecipe) return;
    const currentImage = image;
    const currentRecipe = attachedRecipe;
    const userMsgContent = text || (currentImage ? "📎 Adjunté una imagen" : "");
    // flushSync so the user bubble paints BEFORE the async LLM call starts —
    // otherwise React can batch these updates with post-await ones and the
    // message appears delayed on slower devices / mobile keyboards.
    flushSync(() => {
      setMessages((m) => [
        ...m,
        {
          id: crypto.randomUUID(),
          role: "user",
          type: "text",
          content: userMsgContent,
          attachedRecipe: currentRecipe ?? undefined,
        },
      ]);
      setInput("");
      setImage(null);
      setAttachedRecipe(null);
      setThinking(true);
    });

    // Local wizard progression short-circuits LLM
    const progressRegex = /\b(siguiente|listo|hecho|ya está|ya esta|continuar|próximo|proximo)\b/i;
    if (!currentImage && !currentRecipe && memory.activeRecipeId && progressRegex.test(text)) {
      setTimeout(() => {
        setThinking(false);
        generateReply(text);
        inputRef.current?.focus();
      }, 400);
      return;
    }

    try {
      const reply = await callLlm(text, currentImage, currentRecipe);
      setThinking(false);
      pushAssistant(reply);
    } catch (e) {
      setThinking(false);
      showError(e, "APP-AI-002");
      // Fallback rule-based
      if (text) generateReply(text);
    }
    inputRef.current?.focus();
  }

  function handleQuick(text: string) {
    setInput(text);
    setTimeout(() => send(), 0);
  }

  function newConversation() {
    setMessages([]);
    setMemory(emptyMemory);
    if (typeof window !== "undefined") window.sessionStorage.removeItem(SESSION_KEY);
    inputRef.current?.focus();
  }

  function toggleStep(recipe: Recipe, i: number) {
    const current = memory.doneSteps[recipe.id] ?? [];
    const isDone = current.includes(i);
    const next = isDone ? current.filter((x) => x !== i) : [...current, i];
    setMemory((m) => ({
      ...m,
      activeRecipeId: recipe.id,
      activeStepIndex: isDone ? i : Math.max(m.activeStepIndex, i + 1),
      doneSteps: { ...m.doneSteps, [recipe.id]: next },
    }));
  }

  function removeIngredient(w: string) {
    setMemory((m) => ({
      ...m,
      mentionedIngredients: m.mentionedIngredients.filter((x) => x !== w),
    }));
  }

  function clearActive() {
    setMemory((m) => ({ ...m, activeRecipeId: null, activeStepIndex: 0 }));
  }

  const empty = messages.length === 0;
  const firstName = profile?.first_name?.trim() || "";
  const showName = !isAuthenticated || (!profileLoading && !!firstName);
  const namePart = showName && firstName ? `, ${firstName}` : "";
  const welcomeTitle = `¿Qué cocinamos${namePart || " hoy"}?`;
  const activeRecipe = memory.activeRecipeId
    ? recipes.find((r) => r.id === memory.activeRecipeId)
    : null;
  const activeSteps = activeRecipe ? getSteps(activeRecipe) : [];

  // ---- Kiko por voz (ElevenLabs). Las transcripciones viven solo en el
  // estado local de esta sesión, igual que el chat de texto. ----
  const [voiceLimit, setVoiceLimit] = useState<{ open: boolean; isPremium: boolean }>({
    open: false,
    isPremium: false,
  });

  const pushVoiceMsg = useCallback((role: "user" | "assistant", content: string) => {
    setMessages((m) => {
      const last = m[m.length - 1];
      // Evita duplicar la misma transcripción si llega repetida.
      if (last && last.type === "text" && last.role === role && last.content === content) return m;
      return [...m, { id: crypto.randomUUID(), role, type: "text", content, voice: true }];
    });
  }, []);

  const voiceRecipeContext = useMemo(
    () => (activeRecipe ? formatRecipeForLLM(activeRecipe) : undefined),
    [activeRecipe],
  );

  const voice = useKikoVoice({
    enabled: isAuthenticated,
    buildSystemPrompt: () => buildSystemPrompt(),
    recipeTitle: activeRecipe?.title,
    recipeContext: voiceRecipeContext,
    firstName,
    onUserTranscript: (t) => pushVoiceMsg("user", t),
    onAgentTranscript: (t) => pushVoiceMsg("assistant", t),
    onLimitReached: (isPremium) => setVoiceLimit({ open: true, isPremium }),
  });

  useEffect(() => {
    if (profileLoading) return;

    if (autoVoice && voice.status === "idle") {
      navigate({ search: (prev) => ({ ...prev, voice: undefined }), replace: true });
      if (!isAuthenticated || !isPremium) {
        setPaywallOpen(true);
      } else {
        if (!voice.hasQuota && !voice.quotaLoading && voice.quota) {
          setVoiceLimit({ open: true, isPremium: voice.quota.isPremium });
        } else {
          void voice.start();
        }
      }
    }
  }, [autoVoice, profileLoading, isAuthenticated, isPremium, voice, navigate]);

  const showMic = input.trim().length === 0 && !image && !attachedRecipe;

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-4xl flex-col overflow-hidden px-0 md:h-dvh md:px-4 md:py-6">
      <section className="flex min-h-0 flex-1 flex-col rounded-none border-border/60 bg-card/30 shadow-sm md:rounded-3xl md:border">
        {/* Header */}
        <header
          className={`flex shrink-0 items-center gap-2 border-b border-border/60 bg-background/80 px-3 py-3 backdrop-blur transition-all duration-200 md:gap-3 md:bg-transparent md:px-6 md:py-4 md:backdrop-blur-none ${keyboardOpen ? "max-md:hidden" : ""}`}
        >
          <button
            type="button"
            aria-label="Volver"
            onClick={() => {
              if (typeof window !== "undefined" && window.history.length > 1) {
                window.history.back();
              } else {
                router.navigate({ to: "/" });
              }
            }}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-border bg-background text-foreground hover:bg-card md:hidden"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-2.5 md:gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground">
              <ChefHat className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="truncate font-display text-lg font-semibold leading-tight md:text-2xl">
                Kiko
              </h1>
              <p className="truncate text-[11px] font-medium uppercase tracking-wider text-[color:var(--ochre)] md:text-sm">
                Asistente de cocina
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (!isAuthenticated || !isPremium) {
                  setPaywallOpen(true);
                  return;
                }
                if (!voice.hasQuota && !voice.quotaLoading && voice.quota) {
                  setVoiceLimit({ open: true, isPremium: voice.quota.isPremium });
                  return;
                }
                void voice.start();
              }}
              className="inline-flex shrink-0 items-center gap-2 rounded-2xl border border-border bg-background px-2.5 py-2 text-sm font-medium text-foreground hover:bg-card md:px-3"
              aria-label="Hablar con Kiko por voz"
              title="Hablar con Kiko por voz"
            >
              <Mic className="h-4 w-4 text-[color:var(--ochre)]" />
              <span className="hidden md:inline font-semibold">Voz Kiko</span>
            </button>
            <button
              onClick={() => setConfirmClear(true)}
              className="inline-flex shrink-0 items-center gap-2 rounded-2xl border border-border bg-background px-2.5 py-2 text-sm font-medium text-foreground hover:bg-card md:px-3"
              aria-label="Nueva conversación"
              title="Nueva conversación"
            >
              <RotateCcw className="h-4 w-4" />
              <span className="hidden md:inline">Nueva conversación</span>
            </button>
            <div className="shrink-0 md:hidden">
              <UserMenu compact />
            </div>
          </div>
        </header>

        <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Iniciar nueva conversación?</AlertDialogTitle>
              <AlertDialogDescription>
                Los chats con tu asistente de cocina se procesan localmente. Si inicias un nuevo
                chat, perderás los mensajes de la sesión actual. ¿Deseas continuar?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  newConversation();
                  setConfirmClear(false);
                }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Sí, reiniciar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Messages */}
        <div
          ref={scrollerRef}
          className="flex flex-1 min-h-0 flex-col overflow-y-auto overscroll-contain p-4 md:p-6"
        >
          {empty ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-5 px-2 text-center">
              <div
                className="transition-opacity duration-200"
                style={{ opacity: isAuthenticated && profileLoading ? 0.6 : 1 }}
              >
                <h2 className="font-display text-2xl font-semibold md:text-3xl">{welcomeTitle}</h2>
                <p className="mt-2 max-w-md text-sm text-muted-foreground">
                  Tu sous-chef digital, listo para ayudarte.
                </p>
              </div>
              {isAuthenticated && (
                <div className="grid w-full max-w-xl gap-2 sm:grid-cols-2">
                  {QUICK_ACTIONS.map((q) => (
                    <button
                      key={q}
                      onClick={() => handleQuick(q)}
                      className="rounded-2xl border border-primary bg-card/50 px-4 py-3 text-left text-sm font-medium text-foreground/80 transition hover:-translate-y-0.5 hover:border-primary/80 hover:text-foreground"
                    >
                      <Sparkles className="mb-1.5 inline h-4 w-4 text-[color:var(--ochre)]" />
                      <div>{q}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {messages.map((m) => {
                if (m.type === "wizard") {
                  const r = recipes.find((x) => x.id === m.recipeId);
                  if (!r) return null;
                  return (
                    <WizardCard
                      key={m.id}
                      recipe={r}
                      steps={getSteps(r)}
                      done={memory.doneSteps[r.id] ?? []}
                      onToggle={(i) => toggleStep(r, i)}
                    />
                  );
                }
                return (
                  <Bubble
                    key={m.id}
                    role={m.role}
                    content={m.content}
                    attachedRecipe={m.attachedRecipe}
                    voice={m.voice}
                  />
                );
              })}
              {thinking && <Bubble role="assistant" content="…" thinking />}
            </div>
          )}
        </div>

        {/* Memory chips */}
        {(activeRecipe || memory.mentionedIngredients.length > 0) && (
          <div className="flex flex-wrap items-center gap-2 px-4 pb-2 md:px-6">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Memoria:
            </span>
            {activeRecipe && (
              <button
                onClick={clearActive}
                className="group inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
                title="Salir de la guía"
              >
                Cocinando: {activeRecipe.title} · paso{" "}
                {Math.min(memory.activeStepIndex + 1, activeSteps.length)}/{activeSteps.length}
                <X className="h-3 w-3 opacity-60 group-hover:opacity-100" />
              </button>
            )}
            {memory.mentionedIngredients.map((w) => (
              <button
                key={w}
                onClick={() => removeIngredient(w)}
                className="group inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1 text-xs text-foreground/80"
                title="Quitar de la memoria"
              >
                {w}
                <X className="h-3 w-3 opacity-60 group-hover:opacity-100" />
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        {sessionReady && !userId ? (
          <div className="relative m-3 rounded-3xl border border-dashed border-primary/40 bg-primary/5 p-5 text-center">
            <span className="mx-auto mb-2 grid h-10 w-10 place-items-center rounded-2xl bg-primary/10 text-primary">
              <Lock className="h-4 w-4" />
            </span>
            <p className="text-sm text-muted-foreground">
              Inicia sesión o regístrate gratis para chatear con Kiko, nuestro asistente con
              Inteligencia Artificial.
            </p>
            <Link
              to="/auth"
              className="mt-3 inline-flex items-center gap-2 rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              <Sparkles className="h-4 w-4" /> Iniciar sesión
            </Link>
          </div>
        ) : voice.inCall ? (
          <VoiceCallBar
            status={voice.status}
            mode={voice.mode}
            levels={voice.levels}
            remaining={voice.remaining}
            onHangUp={voice.stop}
          />
        ) : (
          <div className="relative m-3 shrink-0 rounded-3xl border border-border bg-background p-2 shadow-sm">
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
              <ChatAttachMenu onImage={setImage} onRecipe={setAttachedRecipe} disabled={thinking} />
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                rows={1}
                placeholder={
                  activeRecipe
                    ? `Cocinando ${activeRecipe.title}… di "siguiente" o pregunta lo que sea`
                    : "Escribe, adjunta fotos o recetas…"
                }
                aria-label="Mensaje para el asistente"
                className="max-h-40 min-h-11 flex-1 resize-none rounded-2xl bg-transparent px-3 py-3 text-sm focus:outline-none"
                disabled={thinking}
              />
              {showMic ? (
                <button
                  type="button"
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => {
                    if (!isAuthenticated || !isPremium) {
                      setPaywallOpen(true);
                      return;
                    }
                    if (!voice.hasQuota && !voice.quotaLoading && voice.quota) {
                      setVoiceLimit({ open: true, isPremium: voice.quota.isPremium });
                      return;
                    }
                    void voice.start();
                  }}
                  disabled={thinking || voice.status !== "idle"}
                  className="grid h-11 w-11 flex-none place-items-center rounded-2xl bg-[color:var(--ochre)]/20 text-foreground transition hover:bg-[color:var(--ochre)]/30 disabled:opacity-40"
                  aria-label="Hablar con Kiko"
                  title="Hablar con Kiko"
                >
                  <Mic className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={send}
                  disabled={thinking || (!input.trim() && !image && !attachedRecipe)}
                  className="grid h-11 w-11 flex-none place-items-center rounded-2xl bg-primary text-primary-foreground transition hover:bg-primary/90 disabled:opacity-40"
                  aria-label="Enviar"
                >
                  <Send className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        )}
      </section>

      <VoiceLimitModal
        open={voiceLimit.open}
        onOpenChange={(open) => setVoiceLimit((v) => ({ ...v, open }))}
        isPremium={voiceLimit.isPremium}
      />
      <KikoVoicePaywallModal open={paywallOpen} onOpenChange={setPaywallOpen} />
    </div>
  );
}

function Bubble({
  role,
  content,
  thinking,
  attachedRecipe,
  voice,
}: {
  role: "user" | "assistant";
  content: string;
  thinking?: boolean;
  attachedRecipe?: AttachedRecipe;
  /** Message came from a live voice transcript. */
  voice?: boolean;
}) {
  const isUser = role === "user";
  const hasText = !!content;
  return (
    <div className={`flex items-start gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      {isUser ? (
        <UserAvatarBubble />
      ) : (
        <span className="grid h-9 w-9 flex-none place-items-center rounded-2xl bg-primary text-primary-foreground">
          <ChefHat className="h-4 w-4" />
        </span>
      )}
      <div className={`flex max-w-[85%] flex-col gap-2 ${isUser ? "items-end" : "items-start"}`}>
        {(hasText || thinking) && (
          <div
            className={`whitespace-pre-wrap rounded-3xl px-4 py-3 text-sm leading-relaxed ${
              isUser
                ? "bg-[color:var(--ochre)]/25 text-foreground"
                : "bg-card text-foreground border border-border/50"
            } ${!isUser && !thinking ? "origin-top-left animate-in fade-in-0 zoom-in-95 duration-300 ease-out" : ""}`}
          >
            {thinking ? (
              <TypingDots />
            ) : (
              <span
                className={
                  !isUser
                    ? "inline-block animate-in fade-in-0 duration-500 [animation-delay:180ms] fill-mode-backwards"
                    : ""
                }
              >
                {voice && (
                  <Mic
                    className="mr-1.5 inline h-3 w-3 -translate-y-px opacity-60"
                    aria-label="Mensaje por voz"
                  />
                )}
                {renderMarkdownLite(content)}
              </span>
            )}
          </div>
        )}
        {attachedRecipe && <ChatRecipeAttachmentCard attached={attachedRecipe} />}
      </div>
    </div>
  );
}

function renderMarkdownLite(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? (
      <strong key={i}>{p.slice(2, -2)}</strong>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

function WizardCard({
  recipe,
  steps,
  done,
  onToggle,
}: {
  recipe: Recipe;
  steps: string[];
  done: number[];
  onToggle: (i: number) => void;
}) {
  const doneSet = new Set(done);
  const progress = steps.length ? Math.round((doneSet.size / steps.length) * 100) : 0;

  return (
    <div className="rounded-3xl border border-border bg-background p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-3xl" aria-hidden>
            {recipe.emoji}
          </span>
          <div>
            <h3 className="font-display text-lg font-semibold">{recipe.title}</h3>
            <p className="text-xs text-muted-foreground">
              {recipe.category} · {recipe.timeMinutes} min
            </p>
          </div>
        </div>
        <span className="rounded-full bg-card px-3 py-1 text-xs font-medium">{progress}%</span>
      </div>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-card">
        <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
      </div>

      <ol className="mt-4 flex flex-col gap-2">
        {steps.map((s, i) => {
          const isDone = doneSet.has(i);
          return (
            <li key={i}>
              <button
                onClick={() => onToggle(i)}
                className={`flex w-full items-start gap-3 rounded-2xl border p-3 text-left text-sm transition ${
                  isDone
                    ? "border-primary/30 bg-primary/5 text-foreground/60 line-through"
                    : "border-border bg-card hover:border-primary/40"
                }`}
              >
                {isDone ? (
                  <CheckCircle2 className="mt-0.5 h-5 w-5 flex-none text-primary" />
                ) : (
                  <Circle className="mt-0.5 h-5 w-5 flex-none text-foreground/40" />
                )}
                <span>{s}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

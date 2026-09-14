// Kiko voice call lifecycle (ElevenLabs Agents, WebRTC) — used only by /chef.
// Owns: mic permission, quota, session start/stop, usage pings, hard cutoff
// when the daily budget runs out, and audio levels for the waveform UI.
//
// Transcripts are handed back through callbacks so /chef can push them into
// its LOCAL message state. Nothing here touches the database chat history.
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { VoiceConversation } from "@elevenlabs/client";
import {
  getElevenLabsToken,
  getVoiceQuota,
  logVoiceUsage,
  type VoiceQuotaDTO,
} from "@/lib/voice.functions";
import { showError } from "@/lib/errors/toast";
import { ERR } from "@/lib/errors/codes";

export type VoiceStatus = "idle" | "connecting" | "active" | "ending";

const PING_EVERY_SECONDS = 15;
const BARS = 5;

type Params = {
  enabled: boolean;
  /** Same system prompt the text model gets. */
  buildSystemPrompt: () => string;
  recipeTitle?: string;
  recipeContext?: string;
  firstName?: string;
  onUserTranscript: (text: string) => void;
  onAgentTranscript: (text: string) => void;
  /** Fired when the daily budget runs out (before or during the call). */
  onLimitReached: (isPremium: boolean) => void;
};

export function useKikoVoice({
  enabled,
  buildSystemPrompt,
  recipeTitle,
  recipeContext,
  firstName,
  onUserTranscript,
  onAgentTranscript,
  onLimitReached,
}: Params) {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [mode, setMode] = useState<"speaking" | "listening">("listening");
  const [remaining, setRemaining] = useState(0);
  const [levels, setLevels] = useState<number[]>(() => Array(BARS).fill(0.15));

  const convRef = useRef<VoiceConversation | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rafRef = useRef<number | null>(null);
  const unloggedRef = useRef(0);
  const remainingRef = useRef(0);
  const stoppingRef = useRef(false);

  const quotaQuery = useQuery<VoiceQuotaDTO>({
    queryKey: ["voice-quota"],
    queryFn: () => getVoiceQuota(),
    enabled,
    staleTime: 15_000,
  });

  const flushUsage = useCallback(async () => {
    const seconds = unloggedRef.current;
    if (seconds <= 0) return;
    unloggedRef.current = 0;
    try {
      const quota = await logVoiceUsage({ data: { seconds } });
      remainingRef.current = quota.remainingSeconds;
      setRemaining(quota.remainingSeconds);
      quotaQuery.refetch();
    } catch {
      // Never break the call over a failed ping; the local timer keeps counting.
    }
  }, [quotaQuery]);

  const teardown = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    setLevels(Array(BARS).fill(0.15));
  }, []);

  const stop = useCallback(
    async (reason: "user" | "limit" = "user") => {
      if (stoppingRef.current) return;
      stoppingRef.current = true;
      setStatus("ending");
      teardown();
      try {
        await convRef.current?.endSession();
      } catch {
        // already closed
      }
      convRef.current = null;
      await flushUsage();
      setStatus("idle");
      setMode("listening");
      stoppingRef.current = false;
      if (reason === "limit") onLimitReached(!!quotaQuery.data?.isPremium);
    },
    [flushUsage, onLimitReached, quotaQuery.data?.isPremium, teardown],
  );

  const start = useCallback(async () => {
    if (status !== "idle") return;

    // 1) Hardware permission first: never burn quota on a denied mic.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
    } catch {
      showError(new Error(`${ERR.VOICE_MIC_DENIED}: mic denied`), ERR.VOICE_MIC_DENIED);
      return;
    }

    setStatus("connecting");
    try {
      const session = await getElevenLabsToken({
        data: {
          systemPrompt: buildSystemPrompt(),
          recipeTitle,
          recipeContext,
          firstName,
        },
      });

      remainingRef.current = session.remainingSeconds;
      setRemaining(session.remainingSeconds);
      unloggedRef.current = 0;

      const { Conversation } = await import("@elevenlabs/client");
      const conversation = (await Conversation.startSession({
        conversationToken: session.token,
        connectionType: "webrtc",
        textOnly: false,
        overrides: {
          agent: {
            prompt: { prompt: session.systemPrompt },
            language: "es",
          },
        },
        dynamicVariables: session.dynamicVariables,
        onModeChange: ({ mode: m }) => setMode(m),
        onStatusChange: ({ status: s }) => {
          if (s === "connected") setStatus("active");
        },
        onMessage: ({ message, source }) => {
          const text = (message ?? "").trim();
          if (!text) return;
          if (source === "user") onUserTranscript(text);
          else onAgentTranscript(text);
        },
        onDisconnect: () => {
          if (!stoppingRef.current) void stop("user");
        },
        onError: (message) => {
          console.error("[kiko-voice]", message);
        },
      })) as VoiceConversation;

      convRef.current = conversation;
      setStatus("active");

      // 2) Local countdown + periodic server ping. Hard cutoff at zero.
      timerRef.current = setInterval(() => {
        unloggedRef.current += 1;
        remainingRef.current = Math.max(0, remainingRef.current - 1);
        setRemaining(remainingRef.current);
        if (remainingRef.current <= 0) {
          void stop("limit");
          return;
        }
        if (unloggedRef.current >= PING_EVERY_SECONDS) void flushUsage();
      }, 1000);

      // 3) Waveform levels from live input/output audio.
      const tick = () => {
        const conv = convRef.current;
        if (conv) {
          try {
            const data =
              mode === "speaking"
                ? conv.getOutputByteFrequencyData()
                : conv.getInputByteFrequencyData();
            const step = Math.max(1, Math.floor(data.length / BARS));
            const next = Array.from({ length: BARS }, (_, i) => {
              let sum = 0;
              for (let j = 0; j < step; j++) sum += data[i * step + j] ?? 0;
              return Math.min(1, Math.max(0.15, sum / step / 140));
            });
            setLevels(next);
          } catch {
            // audio graph not ready yet
          }
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch (e) {
      teardown();
      setStatus("idle");
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes(ERR.VOICE_LIMIT_REACHED)) {
        onLimitReached(!!quotaQuery.data?.isPremium);
      } else {
        showError(e, ERR.VOICE_UNAVAILABLE);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    status,
    buildSystemPrompt,
    recipeTitle,
    recipeContext,
    firstName,
    onUserTranscript,
    onAgentTranscript,
    onLimitReached,
    flushUsage,
    stop,
    teardown,
    quotaQuery.data?.isPremium,
  ]);

  // Always hang up and settle usage when leaving /chef.
  useEffect(() => {
    return () => {
      teardown();
      const conv = convRef.current;
      convRef.current = null;
      void conv?.endSession().catch(() => {});
      const seconds = unloggedRef.current;
      unloggedRef.current = 0;
      if (seconds > 0) void logVoiceUsage({ data: { seconds } }).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const quota = quotaQuery.data ?? null;
  const inCall = status === "connecting" || status === "active" || status === "ending";

  return {
    status,
    inCall,
    mode,
    levels,
    remaining,
    quota,
    quotaLoading: quotaQuery.isPending,
    hasQuota: (quota?.remainingSeconds ?? 0) > 0,
    start,
    stop: () => void stop("user"),
  };
}

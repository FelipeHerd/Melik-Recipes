// Voice assistant (Kiko por voz) server functions — /chef only.
// Quota bookkeeping lives server-side; the ElevenLabs API key never ships
// to the browser. Voice transcripts are NOT persisted: the /chef thread
// stays local to the session by design.
import { createServerFn } from "@tanstack/react-start";
import { requireAuth } from "@/lib/auth/require-auth";
import { z } from "zod";

export type VoiceQuotaDTO = {
  limitSeconds: number;
  usedSeconds: number;
  remainingSeconds: number;
  isPremium: boolean;
};

export const getVoiceQuota = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .handler(async ({ context }): Promise<VoiceQuotaDTO> => {
    const { readVoiceQuota } = await import("./voice.server");
    return readVoiceQuota(context.userId);
  });

const tokenSchema = z.object({
  systemPrompt: z.string().min(1).max(20000),
  recipeTitle: z.string().max(200).optional(),
  recipeContext: z.string().max(4000).optional(),
  firstName: z.string().max(80).optional(),
});

export type VoiceSessionDTO = {
  token: string;
  remainingSeconds: number;
  isPremium: boolean;
  /** Prompt + dynamic variables to pass as session overrides. */
  systemPrompt: string;
  dynamicVariables: Record<string, string>;
};

export const getElevenLabsToken = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => tokenSchema.parse(input))
  .handler(async ({ data, context }): Promise<VoiceSessionDTO> => {
    const { readVoiceQuota, requestConversationToken } = await import("./voice.server");

    const quota = await readVoiceQuota(context.userId);
    if (quota.remainingSeconds <= 0) {
      throw new Error("APP-VOICE-001: daily voice limit reached");
    }

    const token = await requestConversationToken();

    // Same context the text model receives, forwarded as session overrides.
    const systemPrompt = data.recipeContext
      ? `${data.systemPrompt}\n\nReceta activa en pantalla:\n${data.recipeContext}`
      : data.systemPrompt;

    return {
      token,
      remainingSeconds: quota.remainingSeconds,
      isPremium: quota.isPremium,
      systemPrompt,
      dynamicVariables: {
        recipe_title: data.recipeTitle ?? "",
        recipe_context: data.recipeContext ?? "",
        first_name: data.firstName ?? "",
      },
    };
  });

const usageSchema = z.object({ seconds: z.number().int().min(0).max(120) });

export const logVoiceUsage = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .inputValidator((input: unknown) => usageSchema.parse(input))
  .handler(async ({ data, context }): Promise<VoiceQuotaDTO> => {
    const { addVoiceUsage } = await import("./voice.server");
    return addVoiceUsage(context.userId, data.seconds);
  });

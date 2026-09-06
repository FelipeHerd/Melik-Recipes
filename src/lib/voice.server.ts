// Server-only helpers for the Kiko voice assistant (ElevenLabs Agents).
// Handles the daily-quota bookkeeping and the conversation-token request.
// Import via dynamic `await import()` inside a server-function handler.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { hasActivePremium, isAdminOrDev } from "@/lib/premium.server";

/** Daily voice-call budget, in seconds. */
export const VOICE_LIMIT_FREE_SECONDS = 60;
export const VOICE_LIMIT_PREMIUM_SECONDS = 15 * 60;

/** Defensive cap per usage ping so a tampered client can't burn/skip time. */
export const MAX_SECONDS_PER_PING = 120;

/** Fixed business timezone: the counter resets at midnight in Bogotá. */
const TIMEZONE = "America/Bogota";

/** Today's date (YYYY-MM-DD) in the business timezone. */
export function businessToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export type VoiceQuota = {
  limitSeconds: number;
  usedSeconds: number;
  remainingSeconds: number;
  isPremium: boolean;
};

async function resolveLimit(userId: string): Promise<{ limitSeconds: number; isPremium: boolean }> {
  const [premium, staff] = await Promise.all([hasActivePremium(userId), isAdminOrDev(userId)]);
  const isPremium = premium || staff;
  return {
    isPremium,
    limitSeconds: isPremium ? VOICE_LIMIT_PREMIUM_SECONDS : VOICE_LIMIT_FREE_SECONDS,
  };
}

/**
 * Reads the quota with a "lazy reset": when the stored usage date is not
 * today (business timezone), the counter is treated as 0. No cron needed.
 */
export async function readVoiceQuota(userId: string): Promise<VoiceQuota> {
  const { limitSeconds, isPremium } = await resolveLimit(userId);
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("voice_seconds_used_today, voice_usage_date")
    .eq("id", userId)
    .maybeSingle();

  const today = businessToday();
  const sameDay = (data?.voice_usage_date ?? null) === today;
  const usedSeconds = sameDay ? Math.max(0, data?.voice_seconds_used_today ?? 0) : 0;

  return {
    limitSeconds,
    usedSeconds,
    remainingSeconds: Math.max(0, limitSeconds - usedSeconds),
    isPremium,
  };
}

/** Adds consumed seconds (clamped) and rolls the day over when needed. */
export async function addVoiceUsage(userId: string, seconds: number): Promise<VoiceQuota> {
  const current = await readVoiceQuota(userId);
  const delta = Math.min(Math.max(0, Math.round(seconds)), MAX_SECONDS_PER_PING);
  const usedSeconds = Math.min(current.usedSeconds + delta, current.limitSeconds);

  await supabaseAdmin
    .from("profiles")
    .update({ voice_seconds_used_today: usedSeconds, voice_usage_date: businessToday() })
    .eq("id", userId);

  return {
    ...current,
    usedSeconds,
    remainingSeconds: Math.max(0, current.limitSeconds - usedSeconds),
  };
}

/**
 * Requests a short-lived WebRTC conversation token for the configured agent.
 * The API key never leaves the server.
 */
export async function requestConversationToken(): Promise<string> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const agentId = process.env.ELEVENLABS_AGENT_ID;
  if (!apiKey || !agentId) throw new Error("APP-VOICE-003: missing elevenlabs credentials");

  const res = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${encodeURIComponent(agentId)}`,
    { headers: { "xi-api-key": apiKey } },
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[elevenlabs] token error", res.status, body);
    throw new Error(`APP-VOICE-003: elevenlabs ${res.status}`);
  }

  const data = (await res.json()) as { token?: string };
  if (!data.token) throw new Error("APP-VOICE-003: empty token");
  return data.token;
}

import type { VoiceTraits } from "@shopkeeper/agent/settings"
import { requestJson } from "@/lib/api/fetcher"

// Browser calls behind the Voice page and onboarding's voice step: a sample
// reply in a voice being tried, a voice choice saved, and a reply the merchant
// wrote themselves.

export type VoiceReply =
  | { status: "loading" }
  | { status: "ready"; text: string }
  | { status: "error"; message: string }

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

function sendJson<T>(method: "POST" | "PATCH", url: string, body: unknown, fallback: string): Promise<T> {
  return requestJson<T>(
    url,
    { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    fallback,
  )
}

export function draftVoiceReply(traits: VoiceTraits, scenarioId: string): Promise<VoiceReply> {
  return sendJson<{ reply: string }>("POST", "/api/agent/voice/preview", { traits, scenarioId }, "Couldn't draft this reply.").then(
    ({ reply }) => ({ status: "ready" as const, text: reply }),
    (error: unknown) => ({ status: "error" as const, message: errorMessage(error, "Couldn't draft this reply.") }),
  )
}

/** Saves voice choices; settings merge, so naming one trait keeps the others. */
export async function saveVoiceSettings(settings: { voiceTraits?: VoiceTraits; brandVoice?: string }): Promise<void> {
  await sendJson<unknown>("PATCH", "/api/org", { settings }, "Couldn't save your voice.")
}

/** False when the reply is too close to the sample it replaces to teach anything. */
export async function saveVoiceExample(example: { scenarioId: string; draft: string; reply: string }): Promise<boolean> {
  const result = await sendJson<{ saved: boolean }>("POST", "/api/agent/voice/example", example, "Couldn't save your reply.")
  return result.saved
}

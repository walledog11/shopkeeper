import { requestJson } from "@/lib/api/fetcher"

// Browser calls behind the Voice page and onboarding's voice step: a sample
// reply in a voice being tried, and a voice brief rewritten from plain words.

export type VoiceReply =
  | { status: "loading" }
  | { status: "ready"; text: string }
  | { status: "error"; message: string }

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

function postJson<T>(url: string, body: unknown, fallback: string): Promise<T> {
  return requestJson<T>(
    url,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    fallback,
  )
}

export function draftVoiceReply(brief: string, scenarioId: string): Promise<VoiceReply> {
  return postJson<{ reply: string }>("/api/agent/voice/preview", { brief, scenarioId }, "Couldn't draft this reply.").then(
    ({ reply }) => ({ status: "ready" as const, text: reply }),
    (error: unknown) => ({ status: "error" as const, message: errorMessage(error, "Couldn't draft this reply.") }),
  )
}

/** The brief with the merchant's change applied. Rejects with a message to show. */
export async function rewriteVoiceBrief(brief: string, change: string): Promise<string> {
  const result = await postJson<{ brief: string }>("/api/agent/voice/rewrite", { brief, change }, "Couldn't change the voice.")
  return result.brief
}

export function suggestVoiceOptions(brief: string): Promise<{ label: string; brief: string }[]> {
  return postJson<{ options: { label: string; brief: string }[] }>(
    "/api/agent/voice/alternatives",
    { brief },
    "Couldn't suggest two voices.",
  ).then((result) => result.options)
}

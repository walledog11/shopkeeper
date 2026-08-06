import type { ActionEntry } from "@/lib/agent/runner"

export type ChatMessage =
  | { role: "user"; text: string; timestamp: Date }
  | { role: "agent"; summary: string; actions: ActionEntry[]; timestamp: Date; awaitingApproval?: boolean }
  | { role: "thinking" }

export interface OperatorTranscript {
  messages: Array<{ role: "user" | "agent"; text: string }>
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

// The panel opens onto the conversation already in progress, wherever it was
// had. Timestamps are not persisted per message on this endpoint, so restored
// turns carry the load time — they render in order, which is what the transcript
// is for.
export function transcriptToChatMessages(transcript: OperatorTranscript): ChatMessage[] {
  const restoredAt = new Date()
  return transcript.messages.map((message) =>
    message.role === "user"
      ? { role: "user" as const, text: message.text, timestamp: restoredAt }
      : { role: "agent" as const, summary: message.text, actions: [], timestamp: restoredAt }
  )
}

export async function fetchOperatorTranscript(fetchImpl: FetchLike = fetch) {
  const res = await fetchImpl("/api/agent/chat")
  if (!res.ok) return { status: "unavailable" as const }
  return {
    status: "ok" as const,
    transcript: await res.json() as OperatorTranscript,
  }
}

interface AgentChatPayload {
  summary?: string
  actionsPerformed?: ActionEntry[]
  awaitingApproval?: boolean
  error?: string
}

export type SendAgentChatResult =
  | { ok: true; summary: string; actionsPerformed: ActionEntry[]; awaitingApproval?: boolean }
  | { ok: false; error: string }

export async function sendAgentChatInstruction({
  fetchImpl = fetch,
  instruction,
}: {
  fetchImpl?: FetchLike
  instruction: string
}): Promise<SendAgentChatResult> {
  const res = await fetchImpl("/api/agent/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ instruction }),
  })

  const data = await res.json().catch(() => null) as AgentChatPayload | null

  if (!res.ok) {
    return { ok: false, error: data?.error ?? "Something went wrong." }
  }

  return {
    ok: true,
    summary: data?.summary ?? "",
    actionsPerformed: data?.actionsPerformed ?? [],
    ...(data?.awaitingApproval === true ? { awaitingApproval: true as const } : {}),
  }
}

import type { ActionEntry } from "@/lib/agent/runner"

/** localStorage key for the active desk thread (agent chat session id). */
export const SESSION_KEY = "dashboard_agent_session"

export type ChatMessage =
  | { role: "user"; text: string; timestamp: Date }
  | { role: "agent"; summary: string; actions: ActionEntry[]; timestamp: Date; awaitingApproval?: boolean }
  | { role: "thinking" }

export interface AgentSessionDetail {
  id: string
  createdAt: string
  messages: Array<{ role: "user" | "agent"; text: string }>
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
type StorageLike = Pick<Storage, "removeItem">

export function sessionToChatMessages(session: AgentSessionDetail): ChatMessage[] {
  return session.messages.map((message) =>
    message.role === "user"
      ? { role: "user" as const, text: message.text, timestamp: new Date(session.createdAt) }
      : { role: "agent" as const, summary: message.text, actions: [], timestamp: new Date(session.createdAt) }
  )
}

export async function fetchAgentSessionDetail(id: string, fetchImpl: FetchLike = fetch) {
  const res = await fetchImpl(`/api/agent/sessions/${id}`)
  if (res.status === 404) return { status: "missing" as const }
  if (!res.ok) return { status: "unavailable" as const }
  return {
    status: "ok" as const,
    session: await res.json() as AgentSessionDetail,
  }
}

interface AgentChatPayload {
  sessionId?: string
  summary?: string
  actionsPerformed?: ActionEntry[]
  awaitingApproval?: boolean
  error?: string
}

export type SendAgentChatResult =
  | { ok: true; sessionId: string; summary: string; actionsPerformed: ActionEntry[]; awaitingApproval?: boolean }
  | { ok: false; error: string }

function chatRequestBody(instruction: string, sessionId: string | null) {
  return sessionId
    ? { instruction, sessionId }
    : { instruction, sessionId: null }
}

function postAgentChat(instruction: string, sessionId: string | null, fetchImpl: FetchLike) {
  return fetchImpl("/api/agent/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(chatRequestBody(instruction, sessionId)),
  })
}

export async function sendAgentChatInstruction({
  fetchImpl = fetch,
  instruction,
  onStaleSession,
  sessionId,
  storage = localStorage,
}: {
  fetchImpl?: FetchLike
  instruction: string
  onStaleSession?: () => void
  sessionId: string | null
  storage?: StorageLike
}): Promise<SendAgentChatResult> {
  let res = await postAgentChat(instruction, sessionId, fetchImpl)

  if (res.status === 404 && sessionId) {
    onStaleSession?.()
    storage.removeItem(SESSION_KEY)
    res = await fetchImpl("/api/agent/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instruction }),
    })
  }

  const data = await res.json().catch(() => null) as AgentChatPayload | null

  if (!res.ok) {
    return { ok: false, error: data?.error ?? "Something went wrong." }
  }

  return {
    ok: true,
    sessionId: data?.sessionId ?? "",
    summary: data?.summary ?? "",
    actionsPerformed: data?.actionsPerformed ?? [],
    ...(data?.awaitingApproval === true ? { awaitingApproval: true as const } : {}),
  }
}

export function deleteAgentSessionHistory(fetchImpl: FetchLike = fetch) {
  return fetchImpl("/api/agent/sessions", { method: "DELETE" })
}

import type { ActionEntry } from "@/lib/agent/runner"
import type { GatewayAgentRequestPayload } from "@/lib/agent/api/gateway-operator-turn"

export type ChatMessage =
  | { role: "user"; text: string; timestamp: Date }
  | { role: "agent"; summary: string; actions: ActionEntry[]; timestamp: Date; awaitingApproval?: boolean }
  | { role: "thinking"; status?: string }

export interface OperatorTranscript {
  messages: Array<{ role: "user" | "agent"; text: string }>
  requests?: GatewayAgentRequestPayload[]
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
  requestId?: string
  statusUrl?: string
  status?: string
  taskRevision?: number | null
  cancelledAt?: string | null
  response?: {
    requestId?: string | null
    summary: string
    actionsPerformed: ActionEntry[]
    awaitingApproval?: boolean
  } | null
  error?: string
}

export interface AgentRequestControl {
  requestId: string
  taskRevision: number
  status: string
  cancelledAt?: string | null
}

export function canStopAgentRequest(request: AgentRequestControl | null): boolean {
  return request !== null && !request.cancelledAt
    && ["queued", "running", "waiting_input", "waiting_approval"].includes(request.status)
}

function requestControl(data: AgentChatPayload | null): AgentRequestControl | null {
  return data?.requestId && typeof data.taskRevision === "number" && data.status
    ? { requestId: data.requestId, taskRevision: data.taskRevision, status: data.status, cancelledAt: data.cancelledAt }
    : null
}

export async function stopAgentChatRequest(request: AgentRequestControl, fetchImpl: FetchLike = fetch) {
  const response = await fetchImpl(`/api/agent/requests/${request.requestId}/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ taskRevision: request.taskRevision }),
  })
  const data = await response.json().catch(() => null) as AgentChatPayload | null
  if (!response.ok) return { ok: false as const, error: data?.error ?? "Could not record the stop. Try again." }
  const control = requestControl(data)
  return control
    ? { ok: true as const, request: control }
    : { ok: false as const, error: "The stop response could not be confirmed. Refresh to check the instruction." }
}

export type SendAgentChatResult =
  | { ok: true; summary: string; actionsPerformed: ActionEntry[]; awaitingApproval?: boolean }
  | { ok: false; error: string }

export function isAgentRequestActive(request: GatewayAgentRequestPayload): boolean {
  return ["accepted", "attached", "queued", "running", "reconciling"].includes(request.status)
}

async function pollAgentRequest(
  statusUrl: string,
  initial: AgentChatPayload | null,
  fetchImpl: FetchLike,
  pollIntervalMs: number,
  onStatus?: (status: string) => void,
  onRequest?: (request: AgentRequestControl) => void,
): Promise<SendAgentChatResult> {
  let data = initial
  for (let poll = 0; poll < 800; poll += 1) {
    if (data?.status) onStatus?.(data.status)
    const control = requestControl(data)
    if (control) onRequest?.(control)
    if (data?.status === "cancelled") {
      return {
        ok: true, summary: "Stopped. No further work will run for this instruction.",
        actionsPerformed: data.response?.actionsPerformed ?? [],
      }
    }
    if (data?.status === "failed" || data?.status === "reconciling") {
      // Only the response attributed to this request can explain its outcome.
      // A resumed task may still carry a previous attempt's message.
      const response = data.response
      if (response && response.requestId === data.requestId && data.requestId && response.summary) {
        return {
          ok: true,
          summary: data.cancelledAt
            ? `${response.summary}\n\nStopped further work. Check the action's outcome before continuing.`
            : response.summary,
          actionsPerformed: response.actionsPerformed,
        }
      }
      return { ok: false, error: data.status === "reconciling"
        ? data.cancelledAt
          ? "Stopped further work. An action had already started; check its outcome before continuing."
          : "This request needs review before it can continue."
        : "The request did not complete." }
    }
    if (data?.response && !["accepted", "attached", "queued", "running"].includes(data.status ?? "")) {
      return {
        ok: true,
        summary: data.response.summary,
        actionsPerformed: data.response.actionsPerformed,
        ...(data.response.awaitingApproval === true ? { awaitingApproval: true as const } : {}),
      }
    }
    if (pollIntervalMs > 0) await new Promise(resolve => setTimeout(resolve, pollIntervalMs))
    const statusResponse = await fetchImpl(statusUrl)
    data = await statusResponse.json().catch(() => null) as AgentChatPayload | null
    if (!statusResponse.ok) {
      return { ok: false, error: data?.error ?? "Could not recover the request status." }
    }
  }
  return { ok: false, error: "The request is still running. Its result will appear when it completes." }
}

export function resumeAgentChatRequest(
  requestId: string,
  fetchImpl: FetchLike = fetch,
  pollIntervalMs = 750,
  onStatus?: (status: string) => void,
  onRequest?: (request: AgentRequestControl) => void,
): Promise<SendAgentChatResult> {
  return pollAgentRequest(`/api/agent/requests/${requestId}`, null, fetchImpl, pollIntervalMs, onStatus, onRequest)
}

export async function sendAgentChatInstruction({
  fetchImpl = fetch,
  instruction,
  clientRequestId = crypto.randomUUID(),
  pollIntervalMs = 750,
  onStatus,
  onRequest,
}: {
  fetchImpl?: FetchLike
  instruction: string
  clientRequestId?: string
  pollIntervalMs?: number
  onStatus?: (status: string) => void
  onRequest?: (request: AgentRequestControl) => void
}): Promise<SendAgentChatResult> {
  const submit = () => fetchImpl("/api/agent/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientRequestId, instruction }),
  })
  let res: Response
  try {
    res = await submit()
  } catch {
    // The server may have persisted the first request before the connection was
    // lost. Reusing the same client identity reconnects to that work.
    res = await submit()
  }

  let data = await res.json().catch(() => null) as AgentChatPayload | null

  if (!res.ok) {
    return { ok: false, error: data?.error ?? "Something went wrong." }
  }

  const statusUrl = data?.statusUrl ?? (data?.requestId ? `/api/agent/requests/${data.requestId}` : null)
  if (!statusUrl) return { ok: false, error: "The request was accepted without a recovery identity." }

  return pollAgentRequest(statusUrl, data, fetchImpl, pollIntervalMs, onStatus, onRequest)
}

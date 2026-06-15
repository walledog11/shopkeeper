import { ApiRequestError, requestJson } from "@/lib/api/fetcher"
import type { ActionEntry } from "@/lib/agent/runner"
import type { AgentPlan, AgentTurn, RawToolCall } from "@/types"

const JSON_HEADERS = { "Content-Type": "application/json" } as const
const NETWORK_ERROR = "Network error — please try again."

interface AgentActionPayload {
  actionsPerformed?: ActionEntry[]
  summary?: string | null
  error?: string
}

export type AgentRequestResult =
  | { ok: true; turn: Omit<AgentTurn, "id"> }
  | { ok: false; turn: Omit<AgentTurn, "id"> }

function agentTurnFields(
  instruction: string,
  payload: AgentActionPayload,
  error: string | null,
): Omit<AgentTurn, "id"> {
  return {
    instruction,
    actions: payload.actionsPerformed ?? [],
    summary: payload.summary ?? null,
    error,
  }
}

function networkErrorTurn(instruction: string): Omit<AgentTurn, "id"> {
  return {
    instruction,
    actions: [],
    summary: null,
    error: NETWORK_ERROR,
  }
}

function requestErrorTurn(instruction: string, error: unknown, fallback: string): Omit<AgentTurn, "id"> {
  const message = error instanceof ApiRequestError
    ? error.message
    : error instanceof Error && error.message
      ? error.message
      : fallback
  return {
    instruction,
    actions: [],
    summary: null,
    error: message,
  }
}

export async function executeApprovedAgentPlan(
  threadId: string,
  instruction: string,
  approvedToolCalls: RawToolCall[],
): Promise<AgentRequestResult> {
  try {
    const payload = await requestJson<AgentActionPayload>(
      "/api/agent",
      {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ threadId, instruction, approvedToolCalls }),
      },
      "Agent failed.",
    )
    return { ok: true, turn: agentTurnFields(instruction, payload, null) }
  } catch (error) {
    if (error instanceof ApiRequestError) {
      const payload = (error.payload ?? {}) as AgentActionPayload
      return {
        ok: false,
        turn: agentTurnFields(instruction, payload, error.message),
      }
    }
    return { ok: false, turn: networkErrorTurn(instruction) }
  }
}

export async function askAgentPrivately(
  threadId: string,
  instruction: string,
): Promise<AgentRequestResult> {
  try {
    const payload = await requestJson<AgentActionPayload>(
      "/api/agent/ask",
      {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ threadId, instruction }),
      },
      "Agent failed.",
    )
    return { ok: true, turn: agentTurnFields(instruction, payload, null) }
  } catch (error) {
    if (error instanceof ApiRequestError) {
      const payload = (error.payload ?? {}) as AgentActionPayload
      return {
        ok: false,
        turn: agentTurnFields(instruction, payload, error.message),
      }
    }
    return { ok: false, turn: networkErrorTurn(instruction) }
  }
}

export async function fetchAgentPlan(
  threadId: string,
  instruction: string,
  options: { force?: boolean } = {},
): Promise<AgentPlan> {
  return requestJson<AgentPlan>(
    "/api/agent/plan",
    {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ threadId, instruction, force: options.force ?? false }),
    },
    "Plan request failed",
  )
}

export async function regenerateAgentPlan(
  threadId: string,
  instruction: string,
): Promise<AgentPlan | null> {
  try {
    return await fetchAgentPlan(threadId, instruction, { force: true })
  } catch {
    return null
  }
}

export function planRequestErrorTurn(instruction: string, error: unknown): Omit<AgentTurn, "id"> {
  return requestErrorTurn(instruction, error, "Failed to generate plan — please try again.")
}

export async function quickApproveCachedPlan(threadId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requestJson(
      "/api/agent/quick-approve",
      {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ threadId }),
      },
      "Could not complete this action.",
    )
    return { ok: true }
  } catch (error) {
    const message = error instanceof ApiRequestError
      ? error.message
      : "Network error. Try again."
    return { ok: false, error: message }
  }
}

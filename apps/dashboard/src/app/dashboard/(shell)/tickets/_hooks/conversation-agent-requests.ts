import { ApiRequestError, requestJson } from "@/lib/api/fetcher"
import { planExecutionOutcomeForActions } from "@shopkeeper/agent/execution-outcome"
import type { ActionEntry } from "@/lib/agent/runner"
import type { AgentPlan, AgentTurn, PlanExecutionOutcome, RawToolCall } from "@/types"

const JSON_HEADERS = { "Content-Type": "application/json" } as const
const NETWORK_ERROR = "Network error — please try again."

interface AgentActionPayload {
  actionsPerformed?: ActionEntry[]
  execution?: {
    id?: unknown
    status?: unknown
  }
  summary?: string | null
  error?: string
}

export type AgentRequestResult =
  | { ok: true; executionId: string | null; outcome: "committed"; turn: Omit<AgentTurn, "id"> }
  | { ok: false; executionId: string | null; outcome: Exclude<PlanExecutionOutcome, "committed">; turn: Omit<AgentTurn, "id"> }

type AgentTurnRequestResult =
  | { ok: true; turn: Omit<AgentTurn, "id"> }
  | { ok: false; turn: Omit<AgentTurn, "id"> }

const PLAN_EXECUTION_OUTCOMES = new Set<PlanExecutionOutcome>([
  "committed",
  "failed",
  "partial",
  "unknown",
])

function executionId(payload: AgentActionPayload): string | null {
  return typeof payload.execution?.id === "string" ? payload.execution.id : null
}

function payloadExecutionOutcome(
  payload: AgentActionPayload,
  fallback: PlanExecutionOutcome,
): PlanExecutionOutcome {
  const serverStatus = payload.execution?.status
  if (
    typeof serverStatus === "string"
    && PLAN_EXECUTION_OUTCOMES.has(serverStatus as PlanExecutionOutcome)
  ) {
    return serverStatus as PlanExecutionOutcome
  }
  if (payload.actionsPerformed?.length) {
    return planExecutionOutcomeForActions(payload.actionsPerformed)
  }
  return fallback
}

function outcomeError(outcome: Exclude<PlanExecutionOutcome, "committed">): string {
  switch (outcome) {
    case "failed":
      return "The plan did not complete. Review the activity before trying again."
    case "partial":
      return "Some plan steps completed and others failed. Review the activity before trying again."
    case "unknown":
      return "The plan outcome could not be confirmed. Check the activity before trying again."
  }
}

function executionResult(
  instruction: string,
  payload: AgentActionPayload,
  fallbackOutcome: PlanExecutionOutcome,
  error: string | null,
): AgentRequestResult {
  const outcome = payloadExecutionOutcome(payload, fallbackOutcome)
  const id = executionId(payload)
  if (outcome === "committed") {
    return {
      ok: true,
      executionId: id,
      outcome,
      turn: agentTurnFields(instruction, payload, null),
    }
  }
  return {
    ok: false,
    executionId: id,
    outcome,
    turn: agentTurnFields(instruction, payload, error ?? outcomeError(outcome)),
  }
}

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
    return executionResult(instruction, payload, "committed", null)
  } catch (error) {
    if (error instanceof ApiRequestError) {
      const payload = (error.payload ?? {}) as AgentActionPayload
      const fallbackOutcome = error.status < 500 ? "failed" : "unknown"
      return executionResult(instruction, payload, fallbackOutcome, error.message)
    }
    return {
      ok: false,
      executionId: null,
      outcome: "unknown",
      turn: networkErrorTurn(instruction),
    }
  }
}

export async function askAgentPrivately(
  threadId: string,
  instruction: string,
): Promise<AgentTurnRequestResult> {
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

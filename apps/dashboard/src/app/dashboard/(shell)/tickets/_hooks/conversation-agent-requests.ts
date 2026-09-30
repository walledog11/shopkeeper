import { ApiRequestError, requestJson } from "@/lib/api/fetcher"
import { committedWithUnsentReply, planExecutionOutcomeForActions } from "@shopkeeper/agent/execution-outcome"
import type { ActionEntry } from "@/lib/agent/runner"
import type { AgentPlan, AgentTurn, PlanExecutionOutcome, RawToolCall } from "@/types"
import type { GatewayAgentRequestPayload } from "@/lib/agent/api/gateway-operator-turn"

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
  | { ok: true; executionId: string | null; outcome: "committed"; replyNotSent: boolean; turn: Omit<AgentTurn, "id"> }
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
      replyNotSent: committedWithUnsentReply(payload.actionsPerformed ?? []),
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
  planId?: string | null,
): Promise<AgentRequestResult> {
  try {
    const payload = await requestJson<AgentActionPayload>(
      "/api/agent",
      {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ threadId, instruction, approvedToolCalls, ...(planId ? { planId } : {}) }),
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
  options: { force?: boolean; signal?: AbortSignal } = {},
): Promise<AgentPlan> {
  const stored = readPlanningSubmission(threadId)
  const submission = stored && stored.instruction === instruction && stored.force === (options.force ?? false)
    ? stored : { clientRequestId: crypto.randomUUID(), instruction, force: options.force ?? false }
  storePlanningSubmission(threadId, submission)
  const payload = await requestJson<GatewayAgentRequestPayload>(
    "/api/agent/plan",
    {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ threadId, ...submission }),
      signal: options.signal,
    },
    "Plan request failed",
  )
  storePlanningSubmission(threadId, { ...submission, requestId: payload.requestId })
  return waitForAgentPlan(threadId, payload, options.signal)
}

interface PlanningSubmission {
  clientRequestId: string; instruction: string; force: boolean; requestId?: string
}

function planningStorageKey(threadId: string) { return `shopkeeper:ticket-plan:${threadId}` }
function readPlanningSubmission(threadId: string): PlanningSubmission | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(planningStorageKey(threadId)) ?? "null")
    return value && typeof value.clientRequestId === "string" && typeof value.instruction === "string" && typeof value.force === "boolean" ? value : null
  } catch { return null }
}
function storePlanningSubmission(threadId: string, value: PlanningSubmission | null) {
  try {
    if (value) sessionStorage.setItem(planningStorageKey(threadId), JSON.stringify(value))
    else sessionStorage.removeItem(planningStorageKey(threadId))
  } catch { /* The server's request history also restores accepted work. */ }
}

async function waitForAgentPlan(threadId: string, initial: GatewayAgentRequestPayload, signal?: AbortSignal): Promise<AgentPlan> {
  let payload = initial
  while (true) {
    signal?.throwIfAborted()
    if (payload.plan) {
      storePlanningSubmission(threadId, null)
      return payload.plan
    }
    if (["failed", "cancelled", "reconciling", "waiting_input", "completed"].includes(payload.status)) {
      storePlanningSubmission(threadId, null)
      throw new Error(payload.pendingQuestion ?? (payload.failureCode === "superseded_request"
        ? "A newer instruction replaced this planning request. Review the current draft."
        : payload.status === "cancelled" ? "Planning was stopped."
        : "Planning did not produce a current draft. Review the ticket before trying again."))
    }
    await new Promise<void>((resolve, reject) => {
      const abort = () => { clearTimeout(timer); reject(signal?.reason) }
      const timer = setTimeout(() => { signal?.removeEventListener("abort", abort); resolve() }, 1500)
      signal?.addEventListener("abort", abort, { once: true })
    })
    payload = await requestJson<GatewayAgentRequestPayload>(`/api/agent/requests/${payload.requestId}`, { signal }, "Could not load planning progress")
  }
}

export async function recoverAgentPlan(threadId: string, signal: AbortSignal, onProgress?: (instruction: string) => void): Promise<AgentPlan | null> {
  const history = await requestJson<{ requests: GatewayAgentRequestPayload[] }>(`/api/agent/plan?threadId=${encodeURIComponent(threadId)}`, { signal }, "Could not load planning progress")
  const latest = history.requests[0]
  if (latest && ["queued", "running", "waiting_approval"].includes(latest.status)) {
    if (["queued", "running"].includes(latest.status)) onProgress?.(latest.instruction)
    return waitForAgentPlan(threadId, latest, signal)
  }
  const stored = readPlanningSubmission(threadId)
  if (!latest && stored) {
    onProgress?.(stored.instruction)
    return fetchAgentPlan(threadId, stored.instruction, { force: stored.force, signal })
  }
  return null
}

export async function dismissAgentPlan(threadId: string, planId: string): Promise<void> {
  await requestJson(
    "/api/agent/plan",
    {
      method: "DELETE",
      headers: JSON_HEADERS,
      body: JSON.stringify({ threadId, planId }),
    },
    "Could not dismiss this plan.",
  )
}

export function planRequestErrorTurn(instruction: string, error: unknown): Omit<AgentTurn, "id"> {
  return requestErrorTurn(instruction, error, "Failed to generate plan — please try again.")
}

export async function quickApproveCachedPlan(
  threadId: string,
  planId?: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requestJson(
      "/api/agent/quick-approve",
      {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ threadId, planId }),
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

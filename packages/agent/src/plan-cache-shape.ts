import type { AgentPlan, PlanStep, RawToolCall, ToolCategory } from "./types.js"

export const AGENT_PLAN_CACHE_VERSION = 2

export interface AgentPlanCacheRecordShape {
  version: number
  instruction: string
  lastCustomerMessageId: string | null
  settingsFingerprint: string
  plan: AgentPlan
}

const TOOL_CATEGORIES: ToolCategory[] = ["action", "communication", "internal", "read"]

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function isToolCategory(value: unknown): value is ToolCategory {
  return typeof value === "string" && TOOL_CATEGORIES.includes(value as ToolCategory)
}

function isPlanStep(value: unknown): value is PlanStep {
  if (!isRecord(value)) return false
  return (
    typeof value.id === "string" &&
    typeof value.tool === "string" &&
    typeof value.label === "string" &&
    typeof value.description === "string" &&
    isToolCategory(value.category) &&
    typeof value.enabled === "boolean"
  )
}

function isRawToolCall(value: unknown): value is RawToolCall {
  if (!isRecord(value)) return false
  return typeof value.id === "string" && typeof value.name === "string" && "input" in value
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every(v => typeof v === "string")
}

function isAgentPlan(value: unknown): value is AgentPlan {
  if (!isRecord(value)) return false
  if (typeof value.instruction !== "string") return false
  if (!Array.isArray(value.steps) || !value.steps.every(isPlanStep)) return false
  if (!Array.isArray(value.rawToolCalls) || !value.rawToolCalls.every(isRawToolCall)) return false
  if (value.readResults !== undefined && !isStringRecord(value.readResults)) return false
  if (value.warnings !== undefined && (!Array.isArray(value.warnings) || !value.warnings.every(w => typeof w === "string"))) return false
  return true
}

export function readAgentPlanCacheRecordShape(value: unknown): AgentPlanCacheRecordShape | null {
  if (!isRecord(value)) return null
  if (
    value.version !== AGENT_PLAN_CACHE_VERSION ||
    typeof value.instruction !== "string" ||
    typeof value.settingsFingerprint !== "string" ||
    !isAgentPlan(value.plan)
  ) {
    return null
  }

  return {
    version: value.version,
    instruction: value.instruction,
    lastCustomerMessageId: typeof value.lastCustomerMessageId === "string" ? value.lastCustomerMessageId : null,
    settingsFingerprint: value.settingsFingerprint,
    plan: value.plan,
  }
}

function readAgentPlanCachePlan(value: unknown): AgentPlan | null {
  return readAgentPlanCacheRecordShape(value)?.plan ?? null
}

// The reply text the agent drafted for this thread, pulled from the cached
// plan's send_reply call. Used as the "before" side of a brand-voice edit when
// the operator sends a different reply. Returns null when no draft is cached.
export function extractCachedDraftReply(cachedPlan: unknown): string | null {
  const plan = readAgentPlanCachePlan(cachedPlan)
  if (!plan) return null
  for (const call of plan.rawToolCalls) {
    if (call.name !== "send_reply") continue
    const input = call.input
    if (isRecord(input) && typeof input.text === "string" && input.text.trim()) {
      return input.text
    }
  }
  return null
}

export function getCurrentPlanForThread(
  thread: { cachedPlan: unknown; cachedPlanMessageId: string | null },
  lastCustomerMessageId: string | null,
): AgentPlan | null {
  if (!thread.cachedPlanMessageId || thread.cachedPlanMessageId !== lastCustomerMessageId) return null
  const plan = readAgentPlanCachePlan(thread.cachedPlan)
  return plan && plan.steps.length > 0 ? plan : null
}

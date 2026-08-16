import {
  getCurrentPlanForThread,
  readAgentPlanCacheRecordShape,
  type PlanThreadMessage,
} from "@shopkeeper/agent/plan-cache-shape"
import type { AgentPlan } from "@/types"

const DEFAULT_PLAN_INSTRUCTION = "draft a reply"

export function cachedPlanInstruction(cachedPlan: unknown): string {
  return readAgentPlanCacheRecordShape(cachedPlan)?.instruction.trim() || DEFAULT_PLAN_INSTRUCTION
}

/** Current cached plan for a thread, with the cache-record instruction attached for replanning. */
export function getResolvedCachedPlanForThread(
  thread: {
    cachedPlan: unknown
    cachedPlanMessageId: string | null
    messages: PlanThreadMessage[]
  },
): AgentPlan | null {
  const plan = getCurrentPlanForThread(thread, thread.messages)
  if (!plan) return null
  return {
    ...plan,
    instruction: cachedPlanInstruction(thread.cachedPlan),
  }
}

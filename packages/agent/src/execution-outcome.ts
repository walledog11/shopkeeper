import type { ActionEntry, AgentResult } from "./agent-context.js";
import type { PlanExecutionOutcome } from "./types.js";

const FAILED_ACTION_STATUSES = new Set(["error", "policy_block"]);

export function planExecutionOutcomeForActions(
  actions: readonly Pick<ActionEntry, "status">[],
): PlanExecutionOutcome {
  if (actions.some((action) => action.status === "unknown")) {
    return "unknown";
  }

  const hasFailure = actions.some((action) => (
    action.status !== undefined && FAILED_ACTION_STATUSES.has(action.status)
  ));
  if (!hasFailure) return "committed";

  const hasCommittedAction = actions.some((action) => (
    action.status === undefined
    || action.status === "success"
    || action.status === "escalated"
  ));
  return hasCommittedAction ? "partial" : "failed";
}

export function planExecutionOutcomeForResult(result: AgentResult): PlanExecutionOutcome {
  return planExecutionOutcomeForActions(result.actionsPerformed);
}

export function hasUnknownProviderOutcome(
  actions: readonly Pick<ActionEntry, "status">[],
): boolean {
  return actions.some((action) => action.status === "unknown");
}

/** True when every failure is definite — no provider ambiguity. */
export function isDefinitePlanExecutionFailure(outcome: PlanExecutionOutcome): boolean {
  return outcome === "failed" || outcome === "partial";
}

export function isUnknownPlanExecution(outcome: PlanExecutionOutcome): boolean {
  return outcome === "unknown";
}

export function ledgerStatusForPlanOutcome(
  outcome: PlanExecutionOutcome,
): "committed" | "failed" | "unknown" {
  if (outcome === "unknown") return "unknown";
  if (outcome === "committed") return "committed";
  return "failed";
}

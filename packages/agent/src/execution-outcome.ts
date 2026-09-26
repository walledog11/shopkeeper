import type { ActionEntry, AgentResult } from "./agent-context.js";
import { TOOL_CATEGORIES } from "./tools/registry/index.js";
import type { PlanExecutionOutcome } from "./types.js";

const FAILED_ACTION_STATUSES = new Set<string>(["error", "policy_block"]);

// Structural, so a persisted AgentAction row (string columns) and a live
// ActionEntry are judged by the same rule.
type OutcomeAction = { status?: string | undefined; tool?: string; category?: string | undefined };

function actionCategory(action: OutcomeAction): string | undefined {
  return action.category ?? (action.tool ? TOOL_CATEGORIES[action.tool] : undefined);
}

function isDefiniteFailure(action: OutcomeAction): boolean {
  return action.status !== undefined && FAILED_ACTION_STATUSES.has(action.status);
}

// A reply is delivery, not an effect: a completed refund whose reply was withheld
// or failed to send is still a completed refund (*Durable request and work state*).
// A plan whose only work is the reply is judged by the reply.
function effectActions<T extends OutcomeAction>(actions: readonly T[]): readonly T[] {
  const effects = actions.filter((action) => {
    const category = actionCategory(action);
    return category !== "communication" && category !== "read";
  });
  return effects.length > 0 ? effects : actions;
}

export function planExecutionOutcomeForActions(
  actions: readonly OutcomeAction[],
): PlanExecutionOutcome {
  // Uncertainty anywhere, a reply included, still outranks a known outcome.
  if (actions.some((action) => action.status === "unknown")) {
    return "unknown";
  }

  const effects = effectActions(actions);
  if (!effects.some(isDefiniteFailure)) return "committed";

  const hasCommittedAction = effects.some((action) => (
    action.status === undefined
    || action.status === "success"
    || action.status === "escalated"
  ));
  return hasCommittedAction ? "partial" : "failed";
}

/** True when the plan's effects committed but a reply to the customer did not go out. */
export function committedWithUnsentReply(actions: readonly OutcomeAction[]): boolean {
  return planExecutionOutcomeForActions(actions) === "committed"
    && actions.some((action) => actionCategory(action) === "communication" && isDefiniteFailure(action));
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

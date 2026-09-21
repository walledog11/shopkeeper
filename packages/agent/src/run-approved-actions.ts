import type { ActionEntry } from "./agent-context.js";
import type { RawToolCall } from "./types.js";
import { TOOL_CATEGORIES } from "./tools/registry/index.js";
import { formatOperatorDispatchFailure, isPlanExecutionFailureMessage } from "./message-dispatch.js";

export function summarizeApprovedDashboardActions(actions: ActionEntry[]): string {
  const visibleActions = actions.filter((action) => TOOL_CATEGORIES[action.tool] !== "read");
  const lastAction = visibleActions.at(-1) ?? actions.at(-1);
  const message = lastAction?.result ?? "Approved plan executed.";
  return isPlanExecutionFailureMessage(message)
    ? formatOperatorDispatchFailure(message)
    : message;
}

export function selectExecutableApprovedToolCalls(approvedToolCalls: RawToolCall[]) {
  return approvedToolCalls;
}

export function approvedActionsCompleteOutcome() {
  return "approved_plan_actions";
}

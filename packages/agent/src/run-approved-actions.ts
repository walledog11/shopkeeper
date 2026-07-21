import type { ActionEntry, SupportContext } from "./agent-context.js";
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

export function selectExecutableApprovedToolCalls(
  supportThread: SupportContext["thread"] | null,
  approvedToolCalls: RawToolCall[],
) {
  return supportThread?.channelType === "dashboard_agent"
    ? approvedToolCalls.filter((tc) => TOOL_CATEGORIES[tc.name] === "action")
    : approvedToolCalls;
}

export function approvedActionsEmptyOutcome(supportThread: SupportContext["thread"] | null) {
  return supportThread?.channelType === "dashboard_agent"
    ? "approved_dashboard_actions_empty"
    : "approved_plan_actions_empty";
}

export function approvedActionsCompleteOutcome(supportThread: SupportContext["thread"] | null) {
  return supportThread?.channelType === "dashboard_agent"
    ? "approved_dashboard_actions"
    : "approved_plan_actions";
}

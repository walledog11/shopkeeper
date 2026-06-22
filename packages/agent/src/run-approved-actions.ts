import type { SupportContext } from "./agent-context.js";
import type { RawToolCall } from "./types.js";
import { TOOL_CATEGORIES } from "./tools/registry/index.js";

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

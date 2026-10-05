import type { ActionEntry } from "@shopkeeper/agent/context";
import {
  NAVIGATE_DASHBOARD_TOOL,
  parseNavigateDashboardResult,
  type NavigateDashboardPayload,
} from "@shopkeeper/agent/dashboard-destinations";

export function extractConciergeNavigation(actions: ActionEntry[]): NavigateDashboardPayload | null {
  for (const action of actions) {
    if (action.tool !== NAVIGATE_DASHBOARD_TOOL) continue;
    const payload = parseNavigateDashboardResult(action.result);
    if (payload) return payload;
  }
  return null;
}

export type { NavigateDashboardPayload } from "@shopkeeper/agent/dashboard-destinations";

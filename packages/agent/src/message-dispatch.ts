import type { ActionEntry } from "./agent-context.js";
import { hasUnknownProviderOutcome } from "./execution-outcome.js";

export const INTERNAL_REQUEST_ID_HEADER = "x-shopkeeper-request-id";

/**
 * The failure code a gateway send records when its hop to the dashboard failed
 * before any provider answered. Its text is an HTTP status and a request
 * reference, which tells the merchant nothing they can act on.
 */
export const DASHBOARD_DISPATCH_FAILED = "dashboard_dispatch_failed";

export function formatOperatorDispatchFailure(
  action: Pick<ActionEntry, "status" | "result" | "receipt">,
): string {
  if (action.status === "unknown") {
    return `${action.result} Check the ticket and recorded actions before retrying; delivery may already have completed.`;
  }
  if (action.receipt?.outcome === "failed" && action.receipt.code === DASHBOARD_DISPATCH_FAILED) {
    return "I couldn't send the customer message — delivery failed. Nothing was confirmed sent; try again from the dashboard or wait a moment and retry.";
  }
  return action.result;
}

/**
 * The last thing this turn did that was supposed to reach a customer and did
 * not, phrased for the merchant.
 *
 * Keyed on the tool's declared `communication` category rather than a list of
 * tool names. The list was `send_reply` / `send_email`, so when the gateway's
 * `send_ticket_reply` failed, the turn reported whatever generic reason the loop
 * stopped for — the merchant was told the request "required too many steps"
 * while the actual event was a refused send. A new customer-facing tool must not
 * have to remember to register itself here to be reported honestly; declaring
 * its category is enough.
 */
/**
 * What an approval the merchant gave in this turn did, when it committed: the
 * approved run's own summary, which is the approval's result. Null when no
 * approval committed, or when any outcome in the turn is unknown, which is
 * reported as unknown and never as done.
 */
export function summarizeCommittedApproval(actions: readonly ActionEntry[]): string | null {
  if (hasUnknownProviderOutcome(actions)) return null;
  for (let index = actions.length - 1; index >= 0; index -= 1) {
    const action = actions[index]!;
    if (action.tool === "approve_pending_plan" && action.status === "success") return action.result;
  }
  return null;
}

/**
 * The reply to a turn whose only action was an approval that committed: the
 * approved run's summary, the same words a bare "yes" gets, rather than the
 * model's retelling of it.
 */
export function summarizeApprovalOnlyTurn(actions: readonly ActionEntry[]): string | null {
  return actions.length > 0 && actions.every((action) => action.tool === "approve_pending_plan")
    ? summarizeCommittedApproval(actions)
    : null;
}

export function summarizeOperatorTurnDispatchFailure(actions: ActionEntry[]): string | null {
  for (let index = actions.length - 1; index >= 0; index -= 1) {
    const action = actions[index]!;
    if (
      action.tool === "approve_pending_plan"
      && (action.status === "error" || action.status === "policy_block" || action.status === "unknown")
    ) {
      return action.result;
    }
    if (
      action.category === "communication"
      && (action.status === "error" || action.status === "unknown")
    ) {
      return formatOperatorDispatchFailure(action);
    }
  }
  return null;
}

import type { ActionEntry } from "./agent-context.js";

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

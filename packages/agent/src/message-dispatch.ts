import type { ActionEntry } from "./agent-context.js";

export const INTERNAL_REQUEST_ID_HEADER = "x-shopkeeper-request-id";

export function isMessageDispatchFailureMessage(message: string): boolean {
  return /message dispatch failed/i.test(message)
    || /^Unknown:.*message dispatch/i.test(message);
}

export function isPlanExecutionFailureMessage(message: string): boolean {
  return message.startsWith("Error:") || message.startsWith("Unknown:");
}

export function extractDispatchReference(message: string): string | null {
  const match = message.match(/Reference:\s*([^\s.]+)/i);
  return match?.[1] ?? null;
}

export function formatOperatorDispatchFailure(message: string): string {
  const reference = extractDispatchReference(message);
  const ref = reference ? ` Reference: ${reference}.` : "";

  if (isMessageDispatchFailureMessage(message)) {
    return `I couldn't send the customer message — delivery failed.${ref} Nothing was confirmed sent; try again from the dashboard or wait a moment and retry.`;
  }

  if (message.startsWith("Unknown:")) {
    return `${message}${ref ? "" : ""} If you're unsure whether it went through, check the ticket in the dashboard before retrying.`;
  }

  if (message.startsWith("Error:")) {
    return `${message}${ref}`;
  }

  return message;
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
    if (action.tool === "approve_pending_plan" && isPlanExecutionFailureMessage(action.result)) {
      return formatOperatorDispatchFailure(action.result);
    }
    if (
      action.category === "communication"
      && (action.status === "error" || action.status === "unknown")
    ) {
      return formatOperatorDispatchFailure(action.result);
    }
  }
  return null;
}

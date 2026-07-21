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

export function summarizeOperatorTurnDispatchFailure(actions: ActionEntry[]): string | null {
  for (let index = actions.length - 1; index >= 0; index -= 1) {
    const action = actions[index]!;
    if (action.tool === "approve_pending_plan" && isPlanExecutionFailureMessage(action.result)) {
      return formatOperatorDispatchFailure(action.result);
    }
    if (
      (action.tool === "send_reply" || action.tool === "send_email")
      && (action.status === "error" || action.status === "unknown")
    ) {
      return formatOperatorDispatchFailure(action.result);
    }
  }
  return null;
}

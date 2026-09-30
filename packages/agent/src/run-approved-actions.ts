import type { ActionEntry } from "./agent-context.js";
import type { CommunicationReceiptFactsV1 } from "./tools/result.js";
import type { RawToolCall } from "./types.js";
import { TOOL_LABELS } from "./tools/registry/index.js";
import { actionCategory, isCommittedAction, outcomeCause } from "./execution-outcome.js";
import { formatOperatorDispatchFailure } from "./message-dispatch.js";
import { classifyPerson, personObject } from "./person-name.js";
import { receiptPlaceholderValues } from "./reply-placeholders.js";

function communicationFacts(action: ActionEntry): CommunicationReceiptFactsV1 | null {
  if (action.receipt?.outcome !== "succeeded") return null;
  const facts = action.receipt.facts;
  return "deliveryState" in facts ? facts : null;
}

// Who a customer message was for: the address when the receipt names one,
// otherwise the ticket's customer.
function recipientOf(action: ActionEntry, customer: string): string {
  const destination = communicationFacts(action)?.destination ?? action.receipt?.target;
  return destination?.kind === "email" ? destination.id : customer;
}

// What one action that took effect did, from its receipt and its registered label.
function doneClause(action: ActionEntry, customer: string): string {
  const label = TOOL_LABELS[action.tool] ?? action.tool;
  if (actionCategory(action) === "communication") {
    const queued = communicationFacts(action)?.deliveryState === "accepted"
      ? " (queued, not yet delivered)"
      : "";
    return `${label} to ${recipientOf(action, customer)}${queued}`;
  }
  const shown = action.receipt?.outcome === "succeeded"
    ? receiptPlaceholderValues(action.receipt).map(({ label: name, value }) => `${name} ${value}`)
    : [];
  return shown.length > 0 ? `${label} (${shown.join(", ")})` : label;
}

/**
 * What an approved plan did, for the merchant. A success is composed from the
 * typed receipts of the actions that ran, never from a tool's result text; a
 * failure keeps its existing copy and names what had already committed. A reply
 * that did not go out is not a failure of a plan whose effects committed, so it
 * is said plainly. The summary is display-only; callers use the plan's typed
 * execution outcome and must not format this summary again.
 */
export function summarizeApprovedDashboardActions(
  actions: ActionEntry[],
  customer?: { name: string | null; channelType: string },
): string {
  const ran = actions.filter((action) => actionCategory(action) !== "read");
  if (ran.length === 0) return "Approved plan executed.";

  const who = customer
    ? personObject(classifyPerson({ customerName: customer.name, channelType: customer.channelType }))
    : "the customer";
  const done = ran.filter(isCommittedAction).map((action) => doneClause(action, who));

  const cause = outcomeCause(actions);
  if (!cause) {
    const untold = ran
      .filter((action) => actionCategory(action) === "communication" && !isCommittedAction(action))
      .map((action) => `The message to ${recipientOf(action, who)} wasn't sent, so they haven't been told`);
    const summary = [...done, ...untold].join(". ");
    return summary ? `${summary}.` : "Approved plan executed.";
  }

  const prefix = cause.status === "unknown" ? "Unknown:" : "Error:";
  const lead = formatOperatorDispatchFailure(
    cause.result.startsWith(prefix) ? cause.result : `${prefix} ${cause.result}`,
  );
  return done.length > 0 ? `${lead}\nAlready done: ${done.join(", ")}.` : lead;
}

export function selectExecutableApprovedToolCalls(approvedToolCalls: RawToolCall[]) {
  return approvedToolCalls;
}

export function approvedActionsCompleteOutcome() {
  return "approved_plan_actions";
}

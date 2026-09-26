import { isRecord } from "./guards.js";
import { bindReplyPlaceholders, isResultBinding } from "./reply-placeholders.js";
import type {
  AgentPlan,
  CommunicationDestination,
  ProposalCommunication,
  RawToolCall,
} from "./types.js";

/**
 * The communication snapshot of a proposal: what the merchant approves saying to
 * the customer, and where.
 *
 * It is derived from the proposal's own tool calls rather than authored beside
 * them, so the message the card shows, the one the hash binds and the one that
 * executes are the same bytes. Execution derives it again from the calls it is
 * about to run and refuses when the two disagree.
 */

const CUSTOMER_MESSAGE_TOOLS = new Set(["send_reply", "send_email"]);

function nonBlank(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function customerMessage(
  call: RawToolCall,
  thread: { id: string; channelType: string },
): { destination: CommunicationDestination; draft: string } | null {
  if (!isRecord(call.input)) return null;
  if (call.name === "send_reply") {
    return nonBlank(call.input.text)
      ? { destination: { kind: "thread", id: thread.id, channel: thread.channelType }, draft: call.input.text }
      : null;
  }
  return nonBlank(call.input.to) && nonBlank(call.input.body)
    ? { destination: { kind: "email", id: call.input.to }, draft: call.input.body }
    : null;
}

export function customerMessageCallCount(rawToolCalls: readonly RawToolCall[]): number {
  return rawToolCalls.filter((call) => CUSTOMER_MESSAGE_TOOLS.has(call.name)).length;
}

/**
 * Null when the calls cannot be one exact draft: more than one customer message,
 * one whose input is malformed, or a placeholder no single approved call can
 * fill. Plan validation reports all three, so a plan that reaches a merchant
 * with null here is already invalid.
 */
export function deriveProposalCommunication(
  rawToolCalls: readonly RawToolCall[],
  thread: { id: string; channelType: string },
): ProposalCommunication | null {
  const sends = rawToolCalls.filter((call) => CUSTOMER_MESSAGE_TOOLS.has(call.name));
  if (sends.length === 0) return { mode: "none" };
  if (sends.length > 1) return null;
  const message = customerMessage(sends[0]!, thread);
  if (!message) return null;
  const { bindings, unbound } = bindReplyPlaceholders(message.draft, rawToolCalls);
  return unbound.length === 0
    ? { mode: "exact_draft", ...message, allowedResultBindings: bindings }
    : null;
}

/**
 * The plan's communication contract, or null for a legacy plan that has none —
 * whose draft is an ordinary tool call and whose missing draft blocks it.
 */
export function planCommunication(
  plan: Pick<AgentPlan, "communication" | "suspendedAtProposal">,
): ProposalCommunication | null {
  if (plan.communication) return plan.communication;
  return plan.suspendedAtProposal ? { mode: "none" } : null;
}

/** The part of the communication snapshot that is proposal identity. */
export function communicationIdentity(
  communication: ProposalCommunication | null | undefined,
): Extract<ProposalCommunication, { mode: "exact_draft" }> | null {
  return communication?.mode === "exact_draft" ? communication : null;
}

function isDestination(value: unknown): value is CommunicationDestination {
  if (!isRecord(value) || !nonBlank(value.id)) return false;
  if (value.kind === "email") return Object.keys(value).length === 2;
  return value.kind === "thread" && nonBlank(value.channel) && Object.keys(value).length === 3;
}

export function isProposalCommunication(value: unknown): value is ProposalCommunication {
  if (!isRecord(value)) return false;
  if (value.mode === "none") return Object.keys(value).length === 1;
  return value.mode === "exact_draft"
    && isDestination(value.destination)
    && nonBlank(value.draft)
    && Array.isArray(value.allowedResultBindings)
    && value.allowedResultBindings.every(isResultBinding)
    && Object.keys(value).length === 4;
}

/** The proposal row's snapshot columns. A `none` proposal leaves them null. */
export function communicationColumns(communication: ProposalCommunication | null | undefined) {
  const exact = communicationIdentity(communication);
  return exact
    ? {
        communicationMode: "exact_draft" as const,
        communicationDestination: exact.destination,
        approvedDraft: exact.draft,
        allowedResultBindings: exact.allowedResultBindings,
      }
    : {};
}

/**
 * Reads the snapshot columns back. Null when they do not form a snapshot this
 * runtime can execute, which the caller must refuse rather than treat as `none`.
 */
export function communicationFromColumns(row: {
  communicationMode: string | null;
  communicationDestination: unknown;
  approvedDraft: string | null;
  allowedResultBindings: unknown;
}): ProposalCommunication | null {
  if (row.communicationMode === null) return { mode: "none" };
  const communication = {
    mode: row.communicationMode,
    destination: row.communicationDestination,
    draft: row.approvedDraft,
    allowedResultBindings: row.allowedResultBindings,
  };
  return isProposalCommunication(communication) ? communication : null;
}

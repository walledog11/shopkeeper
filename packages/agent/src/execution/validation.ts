import { isDeepStrictEqual } from "node:util";
import { BadRequestError, ConflictError } from "../errors.js";
import { hashInstruction, hashPlan } from "../agent-actions.js";
import { resolveAutoExecuteMode } from "../settings.js";
import { TOOL_CATEGORIES } from "../tools/registry/index.js";
import type { AgentPlan, OrgSettings, RawToolCall } from "../types.js";
import { type DurableProposalExecutionSource } from "../task-approval.js";
import { deriveProposalCommunication, planCommunication } from "../proposal-communication.js";
import {
  type ApproverIdentity,
  type CurrentCachedPlan,
  type ExpectedPlanIdentity,
  type PlanExecutionLedgerMode,
} from "./types.js";

export function formatApproverId(identity: ApproverIdentity): string {
  return identity.displayName ? `${identity.clerkUserId}:${identity.displayName}` : identity.clerkUserId;
}

export function resolvePlanExecutionLedgerMode(
  value: string | undefined = process.env.PLAN_EXECUTION_LEDGER_MODE,
): PlanExecutionLedgerMode {
  return value === "off" ? "off" : "enforce";
}

const EXECUTABLE_CATEGORIES = new Set(["action", "communication", "internal"]);

export function isAutoExecuteEnabled(settings: OrgSettings): boolean {
  return resolveAutoExecuteMode(settings) === "live";
}

export function getExecutablePlanToolCalls(plan: AgentPlan): RawToolCall[] {
  return plan.rawToolCalls.filter((toolCall) => {
    const category = TOOL_CATEGORIES[toolCall.name];
    return Boolean(category && EXECUTABLE_CATEGORIES.has(category));
  });
}

export function validateApprovedToolCalls(plan: AgentPlan, approvedToolCalls: RawToolCall[]): void {
  const approvedIds = new Set(approvedToolCalls.map((toolCall) => toolCall.id));
  if (approvedIds.size !== approvedToolCalls.length) {
    throw new BadRequestError("Approved tool calls cannot contain duplicate plan steps");
  }
  const plannedById = new Map(plan.rawToolCalls.map((toolCall) => [toolCall.id, toolCall]));
  const allMatch = approvedToolCalls.every((approved) => {
    const planned = plannedById.get(approved.id);
    return Boolean(
      planned
      && planned.name === approved.name
      && isDeepStrictEqual(planned.input, approved.input)
    );
  });
  if (!allMatch) {
    throw new BadRequestError("Approved tool calls must come from the current reviewed plan");
  }
}

export function executableCalls(calls: readonly RawToolCall[]): RawToolCall[] {
  return calls.filter((call) => {
    const category = TOOL_CATEGORIES[call.name];
    return Boolean(category && EXECUTABLE_CATEGORIES.has(category));
  });
}

/**
 * @internal Pure guard exported for deterministic boundary tests.
 *
 * Compared with the plan's own executable calls, which is what the card shows
 * and the merchant approves. The verdict's subset is a different list — empty
 * for a plan that escalates — so comparing with it refused the unchanged plan.
 */
export function validateCustomerFacingApprovalSet(
  plan: Pick<AgentPlan, "rawToolCalls">,
  approvedToolCalls: RawToolCall[],
): void {
  const approvedExecutable = executableCalls(approvedToolCalls);
  const includesCustomerSend = approvedExecutable.some(
    (call) => call.name === "send_reply" || call.name === "send_email",
  );
  if (!includesCustomerSend) return;

  const planned = executableCalls(plan.rawToolCalls);
  const plannedIds = new Set(planned.map((call) => call.id));
  const unchanged = approvedExecutable.length === planned.length
    && approvedExecutable.every((call) => plannedIds.has(call.id));
  if (!unchanged) {
    throw new BadRequestError(
      "Changing action steps requires a revised customer reply and a newly reviewed plan",
    );
  }
}

/**
 * The customer message about to run must be the approved exact draft, to the
 * same destination — and a proposal that authorizes no message may send none.
 * The snapshot is derived again from the calls about to execute rather than
 * trusted, so dropping, adding or editing a message step is refused here
 * instead of sending something the merchant did not see.
 */
export function validateApprovedCommunication(
  plan: AgentPlan,
  approvedToolCalls: RawToolCall[],
  thread: { id: string; channelType: string },
): void {
  const approved = planCommunication(plan);
  if (!approved) return;
  if (!isDeepStrictEqual(deriveProposalCommunication(approvedToolCalls, thread), approved)) {
    throw new ConflictError(
      "The customer message no longer matches the one approved. Review the latest plan before approving it.",
    );
  }
}

export function validateExpectedIdentity(
  current: CurrentCachedPlan & { plan: AgentPlan },
  expected: ExpectedPlanIdentity | undefined,
): void {
  if (!expected) return;
  const currentPlanHash = hashPlan(current.plan);
  const currentInstructionHash = hashInstruction(current.instruction);
  const mismatch = (expected.planId && expected.planId !== current.planId)
    || (expected.sourceMessageId && expected.sourceMessageId !== current.lastCustomerMessageId)
    || (expected.planHash && expected.planHash !== currentPlanHash)
    || (expected.instructionHash && expected.instructionHash !== currentInstructionHash);
  if (mismatch) {
    throw new ConflictError("This plan is no longer current. Review the latest plan before approving it.");
  }
}

export function validateDurableExpectedIdentity(
  source: DurableProposalExecutionSource,
  expected: ExpectedPlanIdentity,
): void {
  const mismatch = expected.planId !== source.proposalId
    || (expected.sourceMessageId && expected.sourceMessageId !== source.sourceMessageId)
    || (expected.planHash && expected.planHash !== source.proposalHash)
    || (expected.instructionHash && expected.instructionHash !== hashInstruction(source.instruction));
  if (mismatch) {
    throw new ConflictError("This plan is no longer current. Review the latest plan before approving it.");
  }
}

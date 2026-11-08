import { requireDurableAgentRuntime } from "../runtime-modes.js";
import { randomUUID } from "node:crypto";
import { BadRequestError, ConflictError } from "../errors.js";
import { requireOrgThread } from "../thread-auth.js";
import { hashInstruction, hashPlan, type AgentActionApproval } from "../agent-actions.js";
import { allowsAutomaticExecution, isEscalationOnlyPlan } from "../autonomy.js";
import logger from "../logger.js";
import { shouldBlockTrustedSendActions } from "../sender-trust.js";
import type { MerchantAnswers } from "../types.js";
import { claimCurrentPlanExecution, type PlanExecutionIdentity } from "../execution-ledger.js";
import { isInvalidPlan } from "../plan-validation.js";
import { authorizeAgentProposal } from "../task-approval.js";
import { communicationIdentity, planCommunication } from "../proposal-communication.js";
import { merchantAnswerSlots, missingMerchantAnswers, type MerchantAnswerSlot } from "../reply-placeholders.js";
import { saveStoreFact } from "../merchant-answer-kb.js";
import { type CachedPlanExecutionParams } from "./types.js";
import {
  formatApproverId,
  resolvePlanExecutionLedgerMode,
  validateApprovedToolCalls,
  executableCalls,
  validateCustomerFacingApprovalSet,
  validateApprovedCommunication,
  validateExpectedIdentity,
} from "./validation.js";
import { loadExecutionSource } from "./plan-source.js";

// Only the answers this approval's blanks ask for travel to the message.
function blankAnswers(
  blanks: readonly MerchantAnswerSlot[],
  answers: MerchantAnswers | undefined,
): MerchantAnswers | undefined {
  if (blanks.length === 0 || !answers) return undefined;
  return Object.fromEntries(blanks.map((blank) => [blank.name, answers[blank.name]!.trim()]));
}

// Saved as the store's answer to the blank, so the next draft's blank is filled
// from it at planning. Losing it costs the merchant a repeat question, never
// this approval.
async function rememberMerchantAnswers(
  blanks: readonly MerchantAnswerSlot[],
  answers: MerchantAnswers | undefined,
  thread: { id: string; organizationId: string },
): Promise<void> {
  for (const blank of blanks) {
    const answer = answers?.[blank.name];
    if (!answer) continue;
    await saveStoreFact({ organizationId: thread.organizationId, name: blank.name, answer }).catch((error: unknown) => {
      logger.warn(
        { err: error instanceof Error ? error.message : String(error), threadId: thread.id, blank: blank.name },
        "[plan-execution] Merchant answer not saved to Memory",
      );
    });
  }
}

/** Validates the reviewed bundle and acquires its durable execution claim before dispatch. */
export async function preparePlanExecution(params: CachedPlanExecutionParams) {
  const thread = await requireOrgThread(params.threadId, params.orgId);
  if (shouldBlockTrustedSendActions(thread.filterStatus)) {
    throw new BadRequestError("Review the sender before sending");
  }

  const current = await loadExecutionSource(params, thread);

  if (current.plan && isInvalidPlan(current.plan)) {
    throw new BadRequestError(
      "This draft is invalid and cannot be approved. Regenerate, revise, dismiss, or take over.",
    );
  }

  if (!current.plan) {
    throw new BadRequestError("Only current approved plans can be executed from this route");
  }

  const verdict = current.verdict;
  const escalationOnly = isEscalationOnlyPlan(current.plan.rawToolCalls);
  if (params.executionIntent === "merchant_approved" && escalationOnly) {
    throw new BadRequestError("This ticket needs you; there is nothing to approve. No refund or customer reply was executed by this approval.");
  }
  const automaticAllowed = allowsAutomaticExecution(verdict, current.plan.rawToolCalls);
  const merchantAllowed = automaticAllowed
    || verdict.kind === "escalate"
    || (verdict.kind === "needs_review" && verdict.approvalAllowed);
  if (
    (params.executionIntent === "automatic" && !automaticAllowed)
    || (params.executionIntent === "merchant_approved" && !merchantAllowed)
  ) {
    throw new BadRequestError("This plan is not executable for the requested approval path");
  }

  if (!current.durableProposal) {
    validateExpectedIdentity({ ...current, plan: current.plan }, params.expectedIdentity);
  }

  // A merchant approving without editing approves the bundle the card shows,
  // reads included, which is what `readParkedProposalForThread` parks and the
  // proposal hash binds. The verdict's executable subset never matches it.
  const requestedToolCalls = params.approvedToolCalls
    ?? (params.executionIntent === "merchant_approved"
      ? current.plan.rawToolCalls
      : "toolCalls" in verdict ? verdict.toolCalls : []);
  validateApprovedToolCalls(current.plan, requestedToolCalls);
  validateCustomerFacingApprovalSet(current.plan, requestedToolCalls);
  validateApprovedCommunication(current.plan, requestedToolCalls, thread);
  const approvedCommunication = planCommunication(current.plan);
  // Checked before anything is claimed: a refund that ran and then a reply
  // withheld for its empty blank is the outcome this order prevents.
  const blanks = merchantAnswerSlots(communicationIdentity(approvedCommunication)?.allowedResultBindings);
  const missingAnswer = missingMerchantAnswers(blanks, params.merchantAnswers)[0];
  if (missingAnswer) {
    throw new BadRequestError(params.executionIntent === "automatic"
      ? "This plan leaves a blank for the merchant and cannot run on its own."
      : `This one needs your answer first: ${missingAnswer.question}`);
  }
  const merchantAnswers = blankAnswers(blanks, params.merchantAnswers);
  if (executableCalls(requestedToolCalls).length === 0) {
    throw new BadRequestError("The current plan has no executable tool calls");
  }

  const auditMode = params.executionIntent === "automatic"
    ? "auto_executed"
    : "human_approved";

  if (!current.planId || (!current.lastCustomerMessageId && !current.durableProposal)) {
    throw new ConflictError("This plan predates durable approvals. Regenerate it before executing.");
  }

  // Every approval surface enters this boundary. Taskless historical cards are
  // readable, but require regeneration and fresh review before any dispatch.
  const ledgerMode = resolvePlanExecutionLedgerMode();
  if (ledgerMode !== "enforce") {
    throw new ConflictError("Durable proposals require the execution ledger.");
  }
  const authorized = params.executionIntent === "merchant_approved" && params.approver
    ? await authorizeAgentProposal({
        organizationId: params.orgId,
        clerkUserId: params.approver.clerkUserId,
        threadId: params.threadId,
        proposalId: current.planId,
        instruction: current.instruction,
        approvedToolCalls: requestedToolCalls,
        communication: current.plan.communication,
        executionLedgerEnforced: ledgerMode === "enforce",
      })
    : null;
  if (params.executionIntent === "merchant_approved" && !authorized) {
    throw new ConflictError("This plan predates durable approvals. Regenerate and review it before executing.");
  }
  if (params.executionIntent === "automatic"
    && (!params.durableTurn?.claimToken || params.durableTurn.expectedRevision === undefined)) {
    throw new ConflictError("Automatic execution requires a claimed durable task. Regenerate this plan.");
  }
  requireDurableAgentRuntime(authorized?.runtimeVersion ?? params.durableTurn?.runtimeVersion);
  const proposalBacked = authorized !== null;
  // Reviewed execution uses the immutable authorized bundle. The thread cache
  // remains a presentation and historical-reader projection.
  const approvedToolCalls = proposalBacked
    ? authorized.canonicalActions
    : requestedToolCalls;
  const executionInstruction = proposalBacked
    ? authorized.instruction
    : current.instruction;
  const executionPlanHash = proposalBacked
    ? authorized.proposalHash
    : hashPlan(current.plan);
  const approval: AgentActionApproval | undefined = auditMode === "human_approved" && params.approver
    ? {
        approverId: formatApproverId(params.approver),
        approvedAt: new Date(),
        approvedPlanHash: executionPlanHash,
        instructionHash: hashInstruction(executionInstruction),
      }
    : undefined;
  // Its own turn, separate from the planning attempt that created the proposal.
  const approvedTurnId = authorized ? randomUUID() : undefined;

  // The PostgreSQL transition is the correctness boundary across dashboard,
  // gateway, devices, and Redis instances. No approved tool reaches its
  // provider until this durable intent exists and this caller owns its token.
  const identity: PlanExecutionIdentity = {
    orgId: params.orgId,
    planId: current.planId,
    threadId: params.threadId,
    sourceMessageId: current.lastCustomerMessageId,
    planHash: executionPlanHash,
    instructionHash: hashInstruction(executionInstruction),
    mode: auditMode,
    approverId: approval?.approverId,
    approvedAt: approval?.approvedAt,
    ...(authorized ? { taskId: authorized.taskId, proposalId: authorized.proposalId } : {}),
  };
  const claim = await claimCurrentPlanExecution(identity);
  if (!claim.claimed || !claim.claimToken) {
    throw new ConflictError("This plan has already been approved or is currently running.");
  }
  const executionId = claim.execution.id;
  const claimToken = claim.claimToken;
  // The approval stands from here, and so does the store fact it stated.
  await rememberMerchantAnswers(blanks, merchantAnswers, thread);

  return {
    current: { ...current, plan: current.plan, planId: current.planId, lastCustomerMessageId: current.lastCustomerMessageId },
    approvedCommunication, auditMode, authorized, approvedToolCalls, executionInstruction, approval, approvedTurnId, executionId, claimToken, proposalBacked, merchantAnswers,
  } as const;
}

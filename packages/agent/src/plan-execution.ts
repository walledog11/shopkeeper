import { Prisma, db, type DbChannelType } from "@shopkeeper/db";
import { isDeepStrictEqual } from "node:util";
import { randomUUID } from "node:crypto";
import { BadRequestError, ConflictError } from "./errors.js";
import { executeAgentTurn, type ExecuteAgentTurnDeps } from "./turn.js";
import { getLatestConversationMessage, requireOrgThread } from "./thread-auth.js";
import { isAgentPlanCacheHit, readAgentPlanCache } from "./plan-cache.js";
import type { PlanFailureReplanContext } from "./plan-cache-shape.js";
import { getPendingCustomerMessageId } from "./plan-cache-shape.js";
import { hashInstruction, hashPlan, type AgentActionApproval } from "./agent-actions.js";
import { allowsAutomaticExecution, decideAutonomy, type AutonomyVerdict } from "./autonomy.js";
import logger from "./logger.js";
import { shouldBlockTrustedSendActions, shouldSkipAutoPlan } from "./sender-trust.js";
import { resolveAutoExecuteMode } from "./settings.js";
import { TOOL_CATEGORIES } from "./tools/registry/index.js";
import {
  isDefinitePlanExecutionFailure,
  isUnknownPlanExecution,
  ledgerStatusForPlanOutcome,
  planExecutionOutcomeForResult,
} from "./execution-outcome.js";
import {
  attemptFailureReplanAfterExecution,
  escalateThreadForUnknownPlanExecution,
  type PlanAgentFn,
} from "./plan-failure-replan.js";
import type { AgentResult } from "./agent-context.js";
import type { AgentPlan, OrgSettings, PlanExecutionOutcome, RawToolCall } from "./types.js";
import {
  claimCurrentPlanExecution,
  completePlanExecution,
  type PlanExecutionIdentity,
} from "./execution-ledger.js";
import { isInvalidPlan } from "./plan-validation.js";
import { recordRequestEpisodeDismissed, recordRequestEpisodeExecution } from "./request-outcome.js";
import { historicalCompletionFacts } from "./completion-facts.js";
import { ANY_MEMBER_ACTOR_KEY, type ProposalSnapshot, type TaskSettlement } from "./task-ledger.js";
import { authorizeAgentProposal, rejectAgentProposal } from "./task-approval.js";

export type PlanExecutionDeps = ExecuteAgentTurnDeps & {
  planAgent?: PlanAgentFn;
};

export interface ApproverIdentity {
  clerkUserId: string;
  displayName: string | null;
}

export function formatApproverId(identity: ApproverIdentity): string {
  return identity.displayName ? `${identity.clerkUserId}:${identity.displayName}` : identity.clerkUserId;
}

interface CurrentCachedPlan {
  channel: DbChannelType;
  instruction: string;
  lastCustomerMessageId: string | null;
  planId: string | null;
  plan: AgentPlan | null;
  verdict: AutonomyVerdict;
  failureReplan: PlanFailureReplanContext | null;
}

export interface FailureReplanRecovery {
  parentResult: AgentResult;
  parentPlan: AgentPlan;
  context: PlanFailureReplanContext;
}

/**
 * A child plan was drafted after a definite parent failure but cannot run on
 * its own authority, so it waits on the thread for the merchant to approve it.
 */
export interface FailureReplanAwaitingApproval {
  planId: string | null;
  sourceMessageId: string | null;
  plan: AgentPlan;
  context: PlanFailureReplanContext;
}

interface ExecutedCachedPlan extends CurrentCachedPlan {
  plan: AgentPlan;
  approvedToolCalls: RawToolCall[];
  execution: {
    id: string | null;
    status: PlanExecutionOutcome;
  };
  result: AgentResult;
  failureReplanRecovery?: FailureReplanRecovery;
  failureReplanAwaitingApproval?: FailureReplanAwaitingApproval;
}

export interface ExpectedPlanIdentity {
  planId?: string | null;
  sourceMessageId?: string | null;
  planHash?: string | null;
  instructionHash?: string | null;
}

export type PlanExecutionLedgerMode = "off" | "enforce";
export type ExecutionIntent = "automatic" | "merchant_approved";

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

function validateApprovedToolCalls(plan: AgentPlan, approvedToolCalls: RawToolCall[]): void {
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

/** @internal Pure guard exported for deterministic boundary tests. */
export function validateCustomerFacingApprovalSet(
  verdict: AutonomyVerdict,
  approvedToolCalls: RawToolCall[],
): void {
  const approvedExecutable = approvedToolCalls.filter((call) => {
    const category = TOOL_CATEGORIES[call.name];
    return Boolean(category && EXECUTABLE_CATEGORIES.has(category));
  });
  const includesCustomerSend = approvedExecutable.some(
    (call) => call.name === "send_reply" || call.name === "send_email",
  );
  if (!includesCustomerSend || !("toolCalls" in verdict)) return;

  const plannedIds = new Set(verdict.toolCalls.map((call) => call.id));
  const unchanged = approvedExecutable.length === verdict.toolCalls.length
    && approvedExecutable.every((call) => plannedIds.has(call.id));
  if (!unchanged) {
    throw new BadRequestError(
      "Changing action steps requires a revised customer reply and a newly reviewed plan",
    );
  }
}

function validateExpectedIdentity(
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

function terminalStatusForResult(result: AgentResult): "committed" | "failed" | "unknown" {
  return ledgerStatusForPlanOutcome(planExecutionOutcomeForResult(result));
}

function executionError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function loadCurrentCachedHomePlan(params: {
  orgId: string;
  threadId: string;
  settings: OrgSettings;
  allowMutativeAutoExecute?: boolean;
}): Promise<CurrentCachedPlan> {
  const thread = await requireOrgThread(params.threadId, params.orgId);
  const cachedPlan = readAgentPlanCache(thread.cachedPlan);
  const latestConversation = await getLatestConversationMessage(params.threadId, params.orgId);
  const pendingCustomerMessageId = latestConversation
    ? getPendingCustomerMessageId([latestConversation])
    : null;
  const instruction = cachedPlan?.instruction ?? "";
  const plan = cachedPlan
    && pendingCustomerMessageId
    && thread.cachedPlanMessageId === pendingCustomerMessageId
    && isAgentPlanCacheHit({
      cache: cachedPlan,
      instruction,
      lastCustomerMessageId: pendingCustomerMessageId,
      settings: params.settings,
    })
    ? cachedPlan.plan
    : null;

  const autonomyContext = {
    filterStatus: thread.filterStatus,
    threadEscalated: Boolean(thread.escalatedAt),
    allowMutativeAutoExecute: params.allowMutativeAutoExecute,
  };
  const verdict = plan
    ? decideAutonomy(plan, params.settings, autonomyContext)
    : decideAutonomy({
        instruction: "",
        steps: [],
        rawToolCalls: [],
        routingEvidence: { classifierState: "not_applicable", codes: [] },
      }, params.settings, autonomyContext);
  return {
    channel: thread.channelType,
    instruction,
    lastCustomerMessageId: cachedPlan?.lastCustomerMessageId ?? null,
    planId: cachedPlan?.planId ?? null,
    plan,
    verdict,
    failureReplan: cachedPlan?.failureReplan ?? null,
  };
}

/**
 * What the merchant is currently being asked to approve on this thread, shaped
 * as the durable proposal a task settles on. Null when the current plan needs no
 * approval, cannot be given one, or no longer matches the pending message — in
 * each case the attempt left no approval wait behind.
 *
 * It reads the same cached plan and the same `decideAutonomy` verdict every
 * approval surface reads, so the recorded proposal is the one the card renders
 * rather than a second derivation of who may approve what.
 */
export async function readParkedProposalForThread(params: {
  orgId: string;
  threadId: string;
  settings: OrgSettings;
  allowMutativeAutoExecute?: boolean;
}): Promise<ProposalSnapshot | null> {
  const current = await loadCurrentCachedHomePlan(params);
  if (!current.plan || !current.planId) return null;
  const verdict = current.verdict;
  if (verdict.kind !== "needs_review" || !verdict.approvalAllowed) return null;
  // The verdict decides whether there is anything to approve; the plan decides
  // what the bundle is. Snapshotting `verdict.toolCalls` instead recorded only
  // the executable subset, while every surface approves the calls the card
  // renders — reads included — so the approved hash could never match the
  // stored one and every support approval conflicted. A step the merchant
  // switches off still changes the hash, which is the check working.
  if (verdict.toolCalls.length === 0) return null;
  return {
    proposalId: current.planId,
    instruction: current.instruction,
    rawToolCalls: current.plan.rawToolCalls,
    sourceRequestIds: [],
  };
}

/**
 * What a finished support attempt left the merchant waiting on, in the task's
 * own terms. A parked question and a parked approval card are both waits a
 * merchant has to end, so they are recorded as waits; everything else — an
 * auto-executed plan, an empty plan, a plan the merchant was never asked about —
 * is the attempt's work done.
 *
 * One derivation for the inbound planning job and for both surfaces that re-plan
 * on a merchant's answer, so a thread's task cannot say one thing on the phone
 * and another in the dashboard. Both scopes are the support rule rather than a
 * caller's choice: the customer initiated the task, and the question and the
 * card are pushed to every bound operator at once, so any member ends either
 * wait and naming one of them would record a scope the product does not have.
 *
 * `merchantQuestion` is what this attempt actually parked, not a second reading
 * of the cache — an attempt that pushed a question is waiting on it even if a
 * newer message has since moved the cached plan on.
 */
export async function supportAttemptSettlement(params: {
  orgId: string;
  threadId: string;
  settings: OrgSettings;
  allowMutativeAutoExecute?: boolean;
  merchantQuestion: string | null;
  sourceRequestIds: string[];
}): Promise<TaskSettlement> {
  if (params.merchantQuestion) {
    return {
      status: "waiting_input",
      question: params.merchantQuestion,
      answerer: { kind: "member", key: ANY_MEMBER_ACTOR_KEY },
    };
  }
  const proposal = await readParkedProposalForThread(params);
  return proposal
    ? {
        status: "waiting_approval",
        proposal: { ...proposal, sourceRequestIds: params.sourceRequestIds },
        approver: { kind: "member", key: ANY_MEMBER_ACTOR_KEY },
      }
    : { status: "completed" };
}

export async function consumeThreadCachedPlan(params: {
  orgId: string;
  threadId: string;
  lastCustomerMessageId: string | null;
}) {
  await db.thread.updateMany({
    where: {
      id: params.threadId,
      organizationId: params.orgId,
      cachedPlanMessageId: params.lastCustomerMessageId,
    },
    data: {
      cachedPlan: Prisma.DbNull,
      cachedPlanMessageId: null,
    },
  });
}

export async function clearThreadPlanCache(params: {
  orgId: string;
  threadId: string;
}) {
  await db.thread.updateMany({
    where: {
      id: params.threadId,
      organizationId: params.orgId,
    },
    data: {
      cachedPlan: Prisma.DbNull,
      cachedPlanMessageId: null,
    },
  });
}

/**
 * Clears only the exact cached plan the caller reviewed, never a newer
 * replacement, and ends the durable approval wait that plan was parked under.
 *
 * The dismissing member is required rather than optional. A dismissal and an
 * approval end the same wait, so they answer to the same recorded scope; a
 * surface allowed to dismiss without saying who would be a second owner of that
 * decision, which is what made the phone and the dashboard disagree about
 * approvals.
 */
export async function dismissCurrentCachedPlan(params: {
  orgId: string;
  threadId: string;
  expectedPlanId: string;
  clerkUserId: string;
}): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ cachedPlan: unknown }>>(Prisma.sql`
      SELECT "cached_plan" AS "cachedPlan"
      FROM "threads"
      WHERE "id" = ${params.threadId}::uuid
        AND "organization_id" = ${params.orgId}::uuid
      FOR UPDATE
    `);
    const cached = locked[0]?.cachedPlan;
    if (!cached || typeof cached !== "object" || Array.isArray(cached)) return false;
    const planId = (cached as { planId?: unknown }).planId;
    if (planId !== params.expectedPlanId) return false;

    const execution = await tx.planExecution.findUnique({
      where: {
        organizationId_planId: {
          organizationId: params.orgId,
          planId: params.expectedPlanId,
        },
      },
      select: { status: true },
    });
    if (execution && execution.status !== "pending" && execution.status !== "failed") {
      throw new ConflictError("This plan has already been approved or is currently running.");
    }

    // Before the draft is destroyed, not after: a member the proposal refuses
    // throws out of here with the card still parked for whoever may decide it.
    await rejectAgentProposal(tx, {
      organizationId: params.orgId,
      clerkUserId: params.clerkUserId,
      proposalId: params.expectedPlanId,
    });

    const cleared = await tx.thread.updateMany({
      where: { id: params.threadId, organizationId: params.orgId },
      data: { cachedPlan: Prisma.DbNull, cachedPlanMessageId: null },
    });
    if (cleared.count === 1) {
      await recordRequestEpisodeDismissed({
        orgId: params.orgId,
        planId: params.expectedPlanId,
      });
    }
    return cleared.count === 1;
  });
}

/**
 * Ties one execution to the durable request and task that authorized it. The
 * turn ID is the request ID because that is how `settleAgentTaskClaim` finds the
 * actions this attempt wrote and links them to the task; it is not a second
 * identity to keep in step.
 */
export interface DurableTurnIdentity {
  requestId: string;
  taskId: string;
  expectedRevision?: number;
  claimToken?: string;
}

export async function executeCurrentCachedHomePlan(params: {
  orgId: string;
  threadId: string;
  settings: OrgSettings;
  executionIntent: ExecutionIntent;
  failureRoute: string;
  approver?: ApproverIdentity;
  approvedToolCalls?: RawToolCall[];
  expectedIdentity?: ExpectedPlanIdentity;
  allowMutativeAutoExecute?: boolean;
  /** When false, suppresses the one bounded child replan after a definite failure. */
  failureReplanAllowed?: boolean;
  /** The durable task this execution belongs to, for hosts that have one. */
  durableTurn?: DurableTurnIdentity;
}, deps: PlanExecutionDeps): Promise<ExecutedCachedPlan> {
  const thread = await requireOrgThread(params.threadId, params.orgId);
  if (shouldBlockTrustedSendActions(thread.filterStatus)) {
    throw new BadRequestError("Review the sender before sending");
  }

  const current = await loadCurrentCachedHomePlan(params);

  if (current.plan && isInvalidPlan(current.plan)) {
    throw new BadRequestError(
      "This draft is invalid and cannot be approved. Regenerate, revise, dismiss, or take over.",
    );
  }

  if (!current.plan) {
    throw new BadRequestError("Only current approved plans can be executed from this route");
  }

  const verdict = current.verdict;
  const automaticAllowed = allowsAutomaticExecution(verdict);
  const merchantAllowed = automaticAllowed
    || verdict.kind === "escalate"
    || (verdict.kind === "needs_review" && verdict.approvalAllowed);
  if (
    (params.executionIntent === "automatic" && !automaticAllowed)
    || (params.executionIntent === "merchant_approved" && !merchantAllowed)
  ) {
    throw new BadRequestError("This plan is not executable for the requested approval path");
  }

  validateExpectedIdentity({ ...current, plan: current.plan }, params.expectedIdentity);

  const approvedToolCalls = params.approvedToolCalls
    ?? ("toolCalls" in verdict ? verdict.toolCalls : []);
  validateApprovedToolCalls(current.plan, approvedToolCalls);
  validateCustomerFacingApprovalSet(verdict, approvedToolCalls);
  if (!approvedToolCalls.some((call) => {
    const category = TOOL_CATEGORIES[call.name];
    return Boolean(category && EXECUTABLE_CATEGORIES.has(category));
  })) {
    throw new BadRequestError("The current plan has no executable tool calls");
  }

  const auditMode = params.executionIntent === "automatic"
    ? "auto_executed"
    : "human_approved";
  const approval: AgentActionApproval | undefined = auditMode === "human_approved" && params.approver
    ? {
        approverId: formatApproverId(params.approver),
        approvedAt: new Date(),
        approvedPlanHash: hashPlan(current.plan),
        instructionHash: hashInstruction(current.instruction),
      }
    : undefined;

  if (!current.planId || !current.lastCustomerMessageId) {
    throw new ConflictError("This plan predates durable approvals. Regenerate it before executing.");
  }

  // The durable approval, taken here because every approval surface enters this
  // function and none of them should own the decision separately. Null means the
  // parked plan names no proposal — a card from before the ledger existed — and
  // those execute exactly as they did before. Taken before the execution claim
  // so a superseded or out-of-scope approval stops before anything is claimed.
  const ledgerMode = resolvePlanExecutionLedgerMode();
  const authorized = params.executionIntent === "merchant_approved" && params.approver
    ? await authorizeAgentProposal({
        organizationId: params.orgId,
        clerkUserId: params.approver.clerkUserId,
        proposalId: current.planId,
        instruction: current.instruction,
        approvedToolCalls,
        executionLedgerEnforced: ledgerMode === "enforce",
      })
    : null;
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
    planHash: hashPlan(current.plan),
    instructionHash: hashInstruction(current.instruction),
    mode: auditMode,
    approverId: approval?.approverId,
    approvedAt: approval?.approvedAt,
    ...(authorized ? { taskId: authorized.taskId, proposalId: authorized.proposalId } : {}),
  };
  let executionId: string | undefined;
  let claimToken: string | undefined;
  if (ledgerMode === "enforce") {
    const claim = await claimCurrentPlanExecution(identity);
    if (!claim.claimed || !claim.claimToken) {
      throw new ConflictError("This plan has already been approved or is currently running.");
    }
    executionId = claim.execution.id;
    claimToken = claim.claimToken;
  }

  let result: AgentResult;
  let terminalExecutionStatus: "committed" | "failed" | "unknown" = "committed";
  try {
    result = await executeAgentTurn({
      orgId: params.orgId,
      threadId: params.threadId,
      instruction: current.instruction,
      failureRoute: params.failureRoute,
      orgSettings: params.settings,
      approvedToolCalls,
      persistAuditNote: true,
      auditMode,
      ...(params.durableTurn ? {
        turnId: params.durableTurn.requestId,
        agentRequestId: params.durableTurn.requestId,
        agentTaskId: params.durableTurn.taskId,
        ...(params.durableTurn.expectedRevision !== undefined && params.durableTurn.claimToken
          ? {
              taskAuthority: {
                kind: "claim" as const,
                taskId: params.durableTurn.taskId,
                expectedRevision: params.durableTurn.expectedRevision,
                claimToken: params.durableTurn.claimToken,
              },
            }
          : {}),
      } : {}),
      // An approved run belongs to the task that parked the proposal, so its
      // messages name that task. `agentRequestId` is deliberately not set: the
      // reply answers the task, not one inbound message of it.
      ...(authorized && approvedTurnId
        ? {
            turnId: approvedTurnId,
            agentTaskId: authorized.taskId,
            ...(executionId && claimToken ? {
              taskAuthority: {
                kind: "approved_proposal" as const,
                taskId: authorized.taskId,
                expectedRevision: authorized.taskRevision,
                proposalId: authorized.proposalId,
                executionId,
                executionClaimToken: claimToken,
              },
            } : {}),
          }
        : {}),
      ...(executionId ? { executionId } : {}),
      completionEvidence: historicalCompletionFacts(
        current.plan.rawToolCalls,
        current.plan.readResults,
      ),
      // A plan that stopped at its proposal drafted no reply, so the run composes
      // one from the receipts this execution produces.
      ...(current.plan.suspendedAtProposal ? { composeFromReceipt: true } : {}),
      ...(approval ? { approval } : {}),
    }, deps);
    terminalExecutionStatus = terminalStatusForResult(result);
    if (executionId && claimToken) {
      await completePlanExecution({
        executionId,
        claimToken,
        status: terminalExecutionStatus,
        error: findFailedToolResult(result)?.result ?? null,
      });
    }
  } catch (error) {
    // A whole-turn throw can occur after a provider accepted a mutation. Until
    // P3 reconciliation can prove otherwise, preserve the ambiguity as unknown
    // and never make the reviewed plan claimable again.
    if (executionId && claimToken) {
      terminalExecutionStatus = "unknown";
      await completePlanExecution({
        executionId,
        claimToken,
        status: terminalExecutionStatus,
        error: executionError(error),
      }).catch(() => undefined);
    }
    if (current.planId) {
      await recordRequestEpisodeExecution({
        orgId: params.orgId,
        planId: current.planId,
        planExecutionId: executionId ?? null,
        executionStatus: "unknown",
        executionIntent: params.executionIntent,
        planVerdict: current.verdict.kind,
      });
    }
    await escalateThreadForUnknownPlanExecution({
      orgId: params.orgId,
      threadId: params.threadId,
      reason: executionError(error),
    });
    throw error;
  } finally {
    await consumeThreadCachedPlan({
      orgId: params.orgId,
      threadId: params.threadId,
      lastCustomerMessageId: current.lastCustomerMessageId,
    });
  }

  if (current.planId) {
    await recordRequestEpisodeExecution({
      orgId: params.orgId,
      planId: current.planId,
      planExecutionId: executionId ?? null,
      executionStatus: terminalExecutionStatus,
      executionIntent: params.executionIntent,
      planVerdict: current.verdict.kind,
    });
  }

  const executionOutcome = planExecutionOutcomeForResult(result);
  if (isUnknownPlanExecution(executionOutcome)) {
    await escalateThreadForUnknownPlanExecution({
      orgId: params.orgId,
      threadId: params.threadId,
      reason: findFailedToolResult(result)?.result ?? "Unknown provider outcome during plan execution.",
    });
    return {
      ...current,
      plan: current.plan,
      approvedToolCalls,
      execution: {
        id: executionId ?? null,
        status: executionOutcome,
      },
      result,
    };
  }

  const failureReplanAllowed = params.failureReplanAllowed !== false
    && !current.failureReplan
    && !authorized
    && Boolean(deps.planAgent);
  if (
    failureReplanAllowed
    && isDefinitePlanExecutionFailure(executionOutcome)
    && deps.planAgent
  ) {
    // The parent's side effects are already committed. Nothing below may throw
    // them away, so a replan that fails for any reason degrades to reporting
    // the parent result rather than surfacing an error to the approver.
    try {
      const attempt = await attemptFailureReplanAfterExecution({
        orgId: params.orgId,
        threadId: params.threadId,
        settings: params.settings,
        instruction: current.instruction,
        sourceMessageId: current.lastCustomerMessageId,
        parentPlanId: current.planId,
        parentPlan: current.plan,
        approvedToolCalls,
        result,
        allowMutativeAutoExecute: params.allowMutativeAutoExecute,
        buildContext: deps.buildContext,
        planAgent: deps.planAgent,
      });

      if (attempt?.status === "executable") {
        // The child shares none of the parent's tool calls or plan identity, so
        // the parent's approval envelope — approvedToolCalls, expectedIdentity,
        // approver — cannot travel with it. Everything it inherits is listed
        // here; it runs on the authority its own verdict grants, which is why
        // the intent is automatic. The durable turn stays off that list too: the
        // parent's request ID is the turn its own actions are ordered within, so
        // a child writing into it would interleave two action sequences. The
        // child's actions reach the task through the thread, not through
        // `taskId`.
        const childExecuted = await executeCurrentCachedHomePlan({
          orgId: params.orgId,
          threadId: params.threadId,
          settings: params.settings,
          executionIntent: "automatic",
          failureRoute: params.failureRoute,
          ...(params.allowMutativeAutoExecute !== undefined
            ? { allowMutativeAutoExecute: params.allowMutativeAutoExecute }
            : {}),
          failureReplanAllowed: false,
        }, deps);
        return {
          ...childExecuted,
          failureReplanRecovery: {
            parentResult: result,
            parentPlan: current.plan,
            context: attempt.context,
          },
        };
      }

      if (attempt?.status === "awaiting_approval") {
        return {
          ...current,
          plan: current.plan,
          approvedToolCalls,
          execution: { id: executionId ?? null, status: executionOutcome },
          result,
          failureReplanAwaitingApproval: {
            planId: attempt.cache.planId,
            sourceMessageId: attempt.cache.lastCustomerMessageId,
            plan: attempt.cache.plan,
            context: attempt.context,
          },
        };
      }
    } catch (replanError) {
      logger.warn({
        orgId: params.orgId,
        threadId: params.threadId,
        planId: current.planId,
        error: executionError(replanError),
      }, "[agent] failure replan did not complete; reporting the parent result");
    }
  }

  return {
    ...current,
    plan: current.plan,
    approvedToolCalls,
    execution: {
      id: executionId ?? null,
      status: planExecutionOutcomeForResult(result),
    },
    result,
  };
}

export async function maybeAutoExecuteCurrentCachedHomePlan(params: {
  orgId: string;
  threadId: string;
  settings: OrgSettings;
  failureRoute: string;
  /** Business-hours and rollout gate for plans that mutate store state. */
  allowMutativeAutoExecute?: boolean;
  durableTurn?: DurableTurnIdentity;
}, deps: PlanExecutionDeps): Promise<ExecutedCachedPlan | null> {
  const thread = await requireOrgThread(params.threadId, params.orgId);
  if (shouldSkipAutoPlan(thread.filterStatus)) {
    return null;
  }

  const current = await loadCurrentCachedHomePlan(params);
  if (!current.plan) {
    return null;
  }

  // A structurally clean quick reply is the low-risk conversational lane: one
  // customer-facing send, optional reads, no mutation, no merchant question and
  // no blocking signal. It is ordinary support work, so every tier except the
  // explicit Draft only tier (which classifies it as needs_review) sends it
  // without consuming merchant attention. The mutative rollout switch below is
  // deliberately irrelevant here; turning on clarifying questions must not turn
  // on refunds or order changes.
  if (current.verdict.kind === "quick_reply") {
    return executeCurrentCachedHomePlan({
      ...params,
      executionIntent: "automatic",
    }, deps);
  }

  if (current.verdict.kind !== "auto_execute" || params.allowMutativeAutoExecute === false) {
    return null;
  }

  if (!isAutoExecuteEnabled(params.settings)) {
    return null;
  }

  return executeCurrentCachedHomePlan({
    ...params,
    executionIntent: "automatic",
  }, deps);
}

export function findFailedToolResult(result: AgentResult): { tool: string; result: string } | null {
  return result.actionsPerformed.find((action) => (
    action.status === "error" || action.status === "policy_block" || action.status === "unknown"
  )) ?? null;
}

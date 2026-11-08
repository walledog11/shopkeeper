import { getLatestConversationMessage, requireOrgThread } from "../thread-auth.js";
import { isAgentPlanCacheHit, readAgentPlanCache, type AgentPlanCacheRecord } from "../plan-cache.js";
import { allowsAutomaticExecution, decideAutonomy, isEscalationOnlyPlan } from "../autonomy.js";
import type { AgentPlan, OrgSettings } from "../types.js";
import { ANY_MEMBER_ACTOR_KEY, type ProposalSnapshot, type TaskSettlement } from "../task-ledger/index.js";
import { readDurableProposalExecutionSource } from "../task-approval.js";
import { buildPlanSteps } from "../planner-steps.js";
import { type CurrentCachedPlan, type ExpectedPlanIdentity, type ExecutionIntent, type OrgThread } from "./types.js";
import { validateDurableExpectedIdentity } from "./validation.js";

// A caller that has just loaded the thread passes it in. Each re-read cost a
// round trip per relation, four times over in one automatic send, and settled
// nothing: the execution claim checks the plan is still current in its own
// transaction.
export async function loadCurrentCachedHomePlan(params: {
  orgId: string;
  threadId: string;
  settings: OrgSettings;
  allowMutativeAutoExecute?: boolean;
  proposedCache?: AgentPlanCacheRecord;
}, loadedThread?: OrgThread): Promise<CurrentCachedPlan> {
  const thread = loadedThread ?? await requireOrgThread(params.threadId, params.orgId);
  const cachedPlan = params.proposedCache ?? readAgentPlanCache(thread.cachedPlan);
  // The plan is current while the message it was drafted against is still the
  // conversation's latest, whoever sent either.
  const sourceMessageId = (await getLatestConversationMessage(params.threadId, params.orgId))?.id ?? null;
  const instruction = cachedPlan?.instruction ?? "";
  const plan = cachedPlan
    && (params.proposedCache ? params.proposedCache.lastCustomerMessageId : thread.cachedPlanMessageId) === sourceMessageId
    && isAgentPlanCacheHit({
      cache: cachedPlan,
      instruction,
      lastCustomerMessageId: sourceMessageId,
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

export async function loadExecutionSource(params: {
  orgId: string;
  threadId: string;
  settings: OrgSettings;
  executionIntent: ExecutionIntent;
  expectedIdentity?: ExpectedPlanIdentity;
  allowMutativeAutoExecute?: boolean;
}, thread: OrgThread): Promise<CurrentCachedPlan> {
  const durable = params.executionIntent === "merchant_approved" && params.expectedIdentity?.planId
    ? await readDurableProposalExecutionSource({
        organizationId: params.orgId,
        threadId: params.threadId,
        proposalId: params.expectedIdentity.planId,
      })
    : null;
  if (!durable) return loadCurrentCachedHomePlan(params, thread);

  validateDurableExpectedIdentity(durable, params.expectedIdentity!);
  // The proposal was judged when it was parked, but the card it was parked from
  // still has the last word on validity: a draft that failed validation never
  // runs, whichever record the approval names.
  const card = readAgentPlanCache(thread.cachedPlan);
  const cardValidation = card?.planId === durable.proposalId ? card.plan.validation : undefined;
  const plan: AgentPlan = {
    planId: durable.proposalId,
    instruction: durable.instruction,
    steps: buildPlanSteps(durable.canonicalActions),
    rawToolCalls: durable.canonicalActions,
    validation: cardValidation ?? { status: "valid", issues: [] },
    routingEvidence: { classifierState: "not_applicable", codes: [] },
    communication: durable.communication,
  };
  return {
    channel: thread.channelType,
    instruction: durable.instruction,
    lastCustomerMessageId: durable.sourceMessageId,
    planId: durable.proposalId,
    plan,
    verdict: decideAutonomy(plan, params.settings, {
      allowMutativeAutoExecute: params.allowMutativeAutoExecute,
    }),
    failureReplan: null,
    durableProposal: true,
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
  manualReview?: boolean;
  proposedCache?: AgentPlanCacheRecord;
}): Promise<ProposalSnapshot | null> {
  const current = await loadCurrentCachedHomePlan(params);
  if (!current.plan || !current.planId || isEscalationOnlyPlan(current.plan.rawToolCalls)) return null;
  const verdict = current.verdict;
  const reviewable = verdict.kind === "needs_review" && verdict.approvalAllowed;
  const explicitlyDrafted = params.manualReview
    && (allowsAutomaticExecution(verdict, current.plan.rawToolCalls) || verdict.kind === "escalate");
  if ((!reviewable && !explicitlyDrafted) || !("toolCalls" in verdict)) return null;
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
    ...(current.plan.communication ? { communication: current.plan.communication } : {}),
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
  manualReview?: boolean;
  proposedCache?: AgentPlanCacheRecord;
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

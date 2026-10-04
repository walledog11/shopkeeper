import { db, createMessage } from '@shopkeeper/db';
import { requireOrgThread, getLatestConversationMessage } from '@shopkeeper/agent/thread-auth';
import { buildContext } from '@shopkeeper/agent/build-context';
import { planAgent } from '@shopkeeper/agent/planner';
import { ConflictError } from '@shopkeeper/shared/errors';
import { resolveAgentSettings } from '@shopkeeper/agent/settings';
import { buildMerchantAnswerPlanningInstruction } from '@shopkeeper/agent/kb-learned';
import { saveMerchantAnswerToKb } from '@shopkeeper/agent/merchant-answer-kb';
import { buildAgentPlanCacheRecord, readAgentPlanCache } from '@shopkeeper/agent/plan-cache';
import { hashInstruction, hashPlan } from '@shopkeeper/agent/agent-actions';
import { extractCachedQuestion, getPendingCustomerMessageId } from '@shopkeeper/agent/plan-cache-shape';
import { clearThreadPlanCache, supportAttemptSettlement } from '@shopkeeper/agent/plan-execution';
import { decideAutonomy } from '@shopkeeper/agent/autonomy';
import { claimContinuedAgentTask, failAgentTaskClaim, settleAgentTaskClaim } from '@shopkeeper/agent/task-ledger';
import type { ContinuedTaskClaim, EndedWait } from '@shopkeeper/agent/task-ledger';
import { withAgentTaskClaim, type TaskRunControl } from '@shopkeeper/agent/task-run';
import {
  captureCommittedPlanOutcome,
  recordRequestEpisodeMerchantInputAnswered,
} from '@shopkeeper/agent/request-outcome';
import type { AgentPlan, OrgSettings } from '@shopkeeper/agent/types';
import { classifyPerson } from '@shopkeeper/agent/person-name';
import logger from '../../logger.js';
import { gatewayThreadSink } from '../support-plan/agent-thread-sink.js';
import { toGatewayAgentPlan } from '../support-plan/agent-plan-adapter.js';
import {
  requiresDashboardDraftReview,
  parkedActionLabel,
  sendOperatorPlanNotification,
  sendOperatorQuestionNotification,
} from '../support-plan/planning-notifications.js';
import { appendPendingPlan, type PendingPlan, type ToolCall } from '../../operator-context.js';
import { getOperatorPlanQueueMax } from '../../config/runtime-config.js';
import { captureObservedMerchantPreferenceProposal } from '@shopkeeper/agent/merchant-preference-capture';
import { buildRequestDisplaySnapshot } from '../shared/request-display.js';

function toPendingPlanToolCalls(
  rawToolCalls: Array<{ id: string; name: string; input?: unknown }>,
): ToolCall[] {
  return rawToolCalls.map((toolCall) => ({ ...toolCall }));
}

export interface OperatorAnswerReplanParams {
  organizationId: string;
  // `member:<orgMemberId>` — the queue the re-drafted plan is parked on.
  memberKey: string;
  /** The answering member, proven by the channel binding — who ends the wait. */
  clerkUserId: string;
  threadId: string;
  // The merchant's freeform text: an answer to a pending question, or revision
  // guidance for a pending plan. Recorded as a note, saved to the KB as a
  // reusable fact, and folded into the re-plan.
  answer: string;
  /** `telegram:<chatId>` / `imessage:<senderId>`; absent on the dashboard. */
  deliveryRef?: string;
  /** Plan that asked the merchant, when known before the cached plan is replaced. */
  askingPlanId?: string | null;
  /**
   * Which wait this text ends — the question the agent asked, or the card it
   * parked. The caller knows because the merchant's tool call is what says so,
   * and answering a question must not end an approval wait it never addressed.
   */
  endsWait: EndedWait;
}

// A re-plan is a plan; the lease matches the one the inbound planning job takes.
const ANSWER_REPLAN_LEASE_MS = 300_000;

// What the attempt left behind, for the task that was waiting on this answer.
// `already_handled` is the closed ticket: the wait is over and there is
// nothing for the merchant to come back to. `failed` is a re-plan that produced
// nothing, which is an attempt that failed rather than an attempt that finished.
export interface OperatorAnswerReplanResult {
  status: 'already_handled' | 'failed' | 'replanned';
  message: string;
}

/**
 * Ingests a merchant's answer/guidance for a thread and re-drafts its plan:
 * record a note, persist the fact to the knowledge base, re-plan with the fact
 * pinned, commit the task and cache together, then notify every operator channel.
 * The approval card goes directly to the phone, including the answering device;
 * the control tool returns only the typed outcome and a short status.
 *
 * The merchant's text also ends the durable wait it was given under — the
 * question for an answer, the parked card for revision guidance. Without that
 * the task stayed suspended until the customer happened to write again, and the
 * card this re-plan parks named no proposal, so approving it fell back to the
 * path that predates durable approvals.
 */
export async function applyOperatorAnswerReplan(
  params: OperatorAnswerReplanParams,
): Promise<OperatorAnswerReplanResult> {
  const continuation = await claimContinuedAgentTask({
    organizationId: params.organizationId,
    clerkUserId: params.clerkUserId,
    threadId: params.threadId,
    endsWait: params.endsWait,
    continuationInstruction: params.answer,
    continuationChannel: 'operator',
    leaseMs: ANSWER_REPLAN_LEASE_MS,
  });
  if (!continuation) {
    throw new ConflictError('This task is no longer available to revise. Regenerate historical plans before continuing.');
  }

  try {
    const outcome = await withAgentTaskClaim(continuation, control => runAnswerReplan(params, continuation, control));
    if (outcome.status === 'failed') await failAnswerContinuation(continuation, params);
    return outcome;
  } catch (err) {
    await failAnswerContinuation(continuation, params);
    throw err;
  }
}

async function failAnswerContinuation(
  continuation: ContinuedTaskClaim,
  params: OperatorAnswerReplanParams,
): Promise<void> {
  try {
    await failAgentTaskClaim({ ...continuation, failureCode: 'answer_replan_failed' });
  } catch (err) {
    logger.error(
      { err, taskId: continuation.taskId, organizationId: params.organizationId },
      '[Operator] Could not record answered support task failure',
    );
  }
}

async function runAnswerReplan(
  params: OperatorAnswerReplanParams,
  continuation: ContinuedTaskClaim,
  control: TaskRunControl,
): Promise<OperatorAnswerReplanResult> {
  const { organizationId, memberKey, threadId, deliveryRef } = params;
  const runtimeVersion = continuation.runtimeVersion;
  const answer = params.answer.trim();

  const [thread, latestConversation, meta] = await Promise.all([
    requireOrgThread(threadId, organizationId),
    getLatestConversationMessage(threadId, organizationId),
    db.thread.findFirst({
      where: { id: threadId, organizationId },
      select: {
        tag: true,
        channelType: true,
        aiSummary: true,
        customer: { select: { name: true } },
      },
    }),
  ]);
  const question = extractCachedQuestion(thread.cachedPlan);
  const askingPlanId = params.askingPlanId
    ?? readAgentPlanCache(thread.cachedPlan)?.planId
    ?? null;

  if (askingPlanId) {
    await recordRequestEpisodeMerchantInputAnswered({
      orgId: organizationId,
      planId: askingPlanId,
    });
  }

  await createMessage({
    threadId,
    senderType: 'note',
    contentText: question
      ? `Merchant answered the agent's question.\n\nQ: ${question}\nA: ${answer}`
      : `Merchant note for the agent: ${answer}`,
  });

  const saved = await saveMerchantAnswerToKb({
    organizationId,
    threadId,
    question,
    answer,
    threadTag: meta?.tag,
    channelType: meta?.channelType ?? thread.channelType,
    threadSummary: meta?.aiSummary,
  });

  void captureObservedMerchantPreferenceProposal({
    organizationId,
    guidance: answer,
    hasPendingQuestion: Boolean(question),
  }).catch((error) => {
    logger.warn(
      { err: (error as Error).message, organizationId, threadId },
      '[Operator] Observed merchant preference capture failed',
    );
  });

  const pendingCustomerMessageId = latestConversation
    ? getPendingCustomerMessageId([latestConversation])
    : null;

  // The customer message was already handled elsewhere — nothing to re-plan against.
  if (!pendingCustomerMessageId) {
    if (!(await settleAgentTaskClaim({ ...continuation, settlement: { status: 'completed' } }))) {
      throw new ConflictError('Task claim was lost before the answer was recorded.');
    }
    if (thread.cachedPlan || thread.cachedPlanMessageId) {
      await clearThreadPlanCache({ orgId: organizationId, threadId });
    }
    logger.info({ organizationId, threadId, reason: 'thread_already_answered' }, '[Operator] Answer recorded, skipped re-plan');
    return {
      message: 'Got it — saved that for next time. This ticket was already handled.',
      status: 'already_handled',
    };
  }

  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { settings: true },
  });
  const settings = resolveAgentSettings(org?.settings as Partial<OrgSettings> | null);
  // The merchant is answering the question the agent asked about the current
  // request, so the replan is instructed with that request — not with a summary
  // of everything the conversation has ever covered.
  const baseInstruction = thread.requestSummary || "Handle this customer's latest request";
  const planningInstruction = buildMerchantAnswerPlanningInstruction({
    baseInstruction,
    question,
    answer,
    saveToKb: true,
  });

  const doReplan = async (): Promise<{ plan: AgentPlan; cacheRecord: ReturnType<typeof buildAgentPlanCacheRecord> }> => {
    const ctx = await buildContext(threadId, organizationId, gatewayThreadSink, {
      pinKbArticles: [{ title: saved.title, body: saved.body }],
      runtimeVersion,
    });
    ctx.taskBudget = control.taskBudget;
    ctx.assertExecutionAllowed = control.assertExecutionAllowed;
    ctx.agentRequestId = continuation.requestId;
    ctx.agentTaskId = continuation.taskId;
    const drafted = await planAgent(
      ctx,
      planningInstruction,
      settings,
      {
        // The merchant typed this answer or revision; it directs the plan.
        merchantInstruction: true,
        runtimeVersion,
      },
    );
    // The answer is planning context; the proposal retains the request's
    // instruction so its cache, card and durable hash name the same bundle.
    const replanned = { ...drafted, instruction: baseInstruction };
    const cacheRecord = buildAgentPlanCacheRecord({
      instruction: baseInstruction,
      lastCustomerMessageId: pendingCustomerMessageId,
      settings,
      plan: replanned,
    });
    control.assertExecutionAllowed();
    const verdict = decideAutonomy(replanned, settings);
    const committed = await settleAgentTaskClaim({
      ...continuation,
      settlement: await supportAttemptSettlement({
        orgId: organizationId, threadId, settings, allowMutativeAutoExecute: false, manualReview: true,
        merchantQuestion: verdict.kind === 'needs_merchant_input' ? verdict.question : null,
        sourceRequestIds: [continuation.requestId], proposedCache: cacheRecord,
      }),
      planCache: { threadId, sourceMessageId: pendingCustomerMessageId, cache: cacheRecord },
    });
    if (!committed) throw new ConflictError('The task stopped or the customer message changed before the draft was published.');
    if (cacheRecord.planId) {
      await captureCommittedPlanOutcome({
        orgId: organizationId,
        thread: {
          id: thread.id,
          customerId: thread.customerId,
          channelType: thread.channelType,
          tag: thread.tag,
          requestDisposition: thread.requestDisposition,
          classifierSignals: thread.classifierSignals,
          filterStatus: thread.filterStatus,
          escalatedAt: thread.escalatedAt,
        },
        sourceMessageId: pendingCustomerMessageId,
        planId: cacheRecord.planId,
        instruction: baseInstruction,
        plan: replanned,
        settings,
      }).catch(err => logger.error({ err, organizationId, threadId }, '[Operator] Could not capture committed answer proposal outcome'));
    }
    return { plan: replanned, cacheRecord };
  };

  let plan: AgentPlan;
  let cacheRecord: ReturnType<typeof buildAgentPlanCacheRecord>;
  try {
    ({ plan, cacheRecord } = await doReplan());
  } catch (err) {
    logger.error({ err: (err as Error).message, organizationId, threadId }, '[Operator] Answer re-plan failed');
    return {
      message: "Saved your answer, but I couldn't draft the reply. Open the ticket to regenerate the proposal.",
      status: 'failed',
    };
  }

  const notifyPlan = toGatewayAgentPlan(plan);
  if (!notifyPlan) {
    logger.error({ organizationId, threadId }, '[Operator] Answer re-plan produced no notify plan');
    return {
      message: "Saved your answer, but I couldn't draft the reply. Open the ticket to regenerate the proposal.",
      status: 'failed',
    };
  }

  const customerName = meta?.customer?.name ?? null;
  const requestDisplay = await buildRequestDisplaySnapshot({
    organizationId,
    threadId,
    sourceMessageId: cacheRecord.lastCustomerMessageId,
    rawToolCalls: notifyPlan.rawToolCalls,
  });
  const verdict = decideAutonomy(plan, settings);
  if (verdict.kind === 'needs_merchant_input') {
    await sendOperatorQuestionNotification(
      organizationId, threadId, customerName, meta?.channelType ?? thread.channelType,
      thread.requestSummary, verdict.question, baseInstruction,
      { planId: cacheRecord.planId, sourceMessageId: pendingCustomerMessageId },
    );
    return { status: 'replanned', message: 'The revised proposal needs more information; I sent the new question.' };
  }

  // The desk's answering member may have no phone binding, so park their copy
  // as well as the copies the shared notification path publishes below.
  const actionLabel = parkedActionLabel(
    notifyPlan.steps,
    classifyPerson({ customerName, channelType: meta?.channelType ?? thread.channelType }),
  );
  const pendingPlan: PendingPlan = {
    threadId,
    instruction: baseInstruction,
    rawToolCalls: toPendingPlanToolCalls(notifyPlan.rawToolCalls),
    ...(cacheRecord.planId && cacheRecord.lastCustomerMessageId ? {
      planId: cacheRecord.planId,
      sourceMessageId: cacheRecord.lastCustomerMessageId,
      planHash: hashPlan(plan),
      instructionHash: hashInstruction(baseInstruction),
    } : {}),
    ...(customerName ? { customerName } : {}),
    ...(actionLabel ? { actionLabel } : {}),
    ...(notifyPlan.validation ? { validation: notifyPlan.validation } : {}),
    ...(requiresDashboardDraftReview(notifyPlan.communication) ? { needsThreadReview: true } : {}),
    requestDisplay,
  };

  // Upsert by threadId: the revised draft replaces this thread's own queued entry
  // and leaves other threads' pending plans intact.
  await appendPendingPlan(organizationId, memberKey, pendingPlan, getOperatorPlanQueueMax());

  // The full, receipt-bound card is delivered without model rewriting. A short
  // tool result cannot substitute for the message the merchant is approving.
  try {
    await sendOperatorPlanNotification(
      organizationId,
      threadId,
      meta?.customer?.name ?? null,
      meta?.channelType ?? thread.channelType,
      thread.requestSummary,
      notifyPlan,
      baseInstruction,
      {
        requestDisplay,
        ...(cacheRecord.planId && cacheRecord.lastCustomerMessageId ? {
          identity: {
            planId: cacheRecord.planId,
            sourceMessageId: cacheRecord.lastCustomerMessageId,
            planHash: hashPlan(plan),
            instructionHash: hashInstruction(baseInstruction),
          },
        } : {}),
      },
    );
  } catch (err) {
    logger.warn(
      { err: (err as Error).message, organizationId, threadId },
      '[Operator] Revised proposal committed; phone notification failed',
    );
    await appendPendingPlan(organizationId, memberKey, { ...pendingPlan, needsThreadReview: true }, getOperatorPlanQueueMax());
    return {
      status: 'replanned',
      message: 'The revised proposal is saved in the ticket, but its phone card could not be delivered. Review it in the dashboard.',
    };
  }

  logger.info({ organizationId, threadId }, '[Operator] Answer ingested and re-planned');
  return {
    message: deliveryRef
      ? 'The revised proposal is ready. Review the full plan card before approving.'
      : 'The revised proposal is ready for review in the ticket.',
    status: 'replanned',
  };
}

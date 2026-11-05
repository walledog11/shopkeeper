import { db, type DbThreadRequestDisposition } from '@shopkeeper/db';
import type { OrgSettings } from '@shopkeeper/agent/types';
import { STATUS } from '../../constants.js';
import logger from '../../logger.js';
import { getConversationBurst, type ConversationBurst } from '../inbound/conversation-burst.js';
import { CHANNEL_TYPE } from '@shopkeeper/agent/thread-constants';
import { loadAutoAckThread, sendAutoAcknowledgement, type AutoAckKind } from '@shopkeeper/messaging';
import { requestAutoAck } from './planning-dashboard-client.js';
import { instagramAutoAckSenders, sendsInstagramInProcess } from './instagram-delivery.js';
import { generateThreadPlan } from './generate-thread-plan.js';
import { degradeForConversationLimit } from './plan-limit.js';
import { mayParkMerchantWork, type PrecomputedPlanResult } from './planning-types.js';

export function shouldSkipRequestWork(
  thread: {
    requestDisposition: DbThreadRequestDisposition | null;
    requestSourceMessageId: string | null;
  } | null | undefined,
  burst: ConversationBurst,
  sourceMessageId?: string,
  skipSummary?: boolean,
  answeredOrderVerification = false,
): boolean {
  if (!sourceMessageId) return false;
  if (burst.messages.at(-1)?.id !== sourceMessageId) return true;
  // The customer answered the order confirmation the agent asked for. A bare
  // "94107" is no request to the classifier, and the turn must still go on.
  if (answeredOrderVerification) return false;
  const dispositionCoversBurst = skipSummary !== true
    || burst.messages[0]?.id === sourceMessageId;
  return thread?.requestSourceMessageId !== sourceMessageId
    || (dispositionCoversBurst && !mayParkMerchantWork(thread.requestDisposition));
}

export async function precomputeThreadPlan(
  organizationId: string,
  threadId: string,
  settings: Pick<OrgSettings, 'autoPlanOnOpen'>,
  options: {
    allowAutoExecute?: boolean;
    instruction?: string;
    sourceMessageId?: string;
    skipSummary?: boolean;
    answeredOrderVerification?: boolean;
  } = {},
): Promise<PrecomputedPlanResult | null> {
  if (settings.autoPlanOnOpen === false) {
    logger.warn({ threadId, organizationId }, '[Worker] autoPlanOnOpen disabled — no plan will be generated for this thread');
    return null;
  }

  try {
    const thread = await db.thread.findUnique({
      where: { id: threadId },
      select: { status: true, requestDisposition: true, requestSourceMessageId: true },
    });
    if (!thread || thread.status !== STATUS.OPEN) {
      return null;
    }
    const burst = await getConversationBurst(threadId);
    if (shouldSkipRequestWork(
      thread,
      burst,
      options.sourceMessageId,
      options.skipSummary,
      options.answeredOrderVerification,
    )) {
      return null;
    }

    // Plan limits degrade, they never block. The customer's message is already
    // persisted by the time we get here, so an org over its monthly conversation
    // allowance simply stops getting drafted plans — nobody's question is
    // dropped, and the merchant still sees the thread in the inbox and can
    // answer it by hand. Blocking here would let a billing cap produce customer
    // silence, which is the failure this product cannot afford.
    if (await degradeForConversationLimit(organizationId, threadId)) {
      return null;
    }

    const {
      plan,
      instruction,
      identity,
      merchantQuestion,
      autoExecuted,
      autoExecutionKind,
      autoExecutionStatus,
      autoExecutionSummary,
      autoExecutionActions,
      autoExecutionError,
      failureReplanRecovered,
      failureReplanAwaitingApproval,
      failureReplanFailureTool,
      failureReplanFailureReason,
    } = await generateThreadPlan(
      organizationId,
      threadId,
      options.allowAutoExecute === true,
      { instruction: options.instruction, sourceMessageId: options.sourceMessageId },
    );
    if (!plan || (plan.steps.length === 0 && plan.validation?.status !== 'invalid')) {
      return null;
    }
    return {
      plan,
      instruction,
      identity,
      merchantQuestion,
      ...(autoExecuted ? {
        autoExecuted: true,
        autoExecutionKind,
        autoExecutionStatus,
        autoExecutionSummary,
        autoExecutionActions,
        autoExecutionError,
        failureReplanRecovered,
        failureReplanAwaitingApproval,
        failureReplanFailureTool,
        failureReplanFailureReason,
      } : {}),
    };
  } catch (err) {
    logger.error({ err: (err as Error).message, threadId, organizationId }, '[Worker] precomputeThreadPlan error');
    throw err;
  }
}

type AutoAckOutcome =
  | { sent: true; skipped: boolean }
  | { sent: false; unknown: boolean; status?: number | null };

// An Instagram thread is acknowledged from here; any other channel through the
// dashboard, which owns those providers.
async function acknowledge(threadId: string, kind: AutoAckKind): Promise<AutoAckOutcome> {
  const thread = sendsInstagramInProcess() ? await loadAutoAckThread(threadId) : null;
  if (thread?.channelType === CHANNEL_TYPE.IG_DM) {
    const result = await sendAutoAcknowledgement(thread, kind, instagramAutoAckSenders);
    return result.ok
      ? { sent: true, skipped: result.skipped }
      : { sent: false, unknown: result.outcome === 'unknown' };
  }
  const response = await requestAutoAck(threadId, kind);
  return response.ok
    ? { sent: true, skipped: Boolean(response.data.skipped) }
    : { sent: false, unknown: response.outcome === 'unknown', status: response.status };
}

// Best-effort customer auto-ack: failures are logged only so the ai-summary job
// still completes.
export async function sendAutoAck(
  organizationId: string,
  threadId: string,
  kind: AutoAckKind = 'after_hours',
): Promise<void> {
  try {
    const outcome = await acknowledge(threadId, kind);
    if (!outcome.sent) {
      logger.warn(
        { status: outcome.status, outcome: outcome.unknown ? 'unknown' : 'failed', threadId, organizationId, kind },
        outcome.unknown
          ? '[Worker] Auto-ack dispatch outcome unknown'
          : '[Worker] Auto-ack dispatch failed',
      );
    } else if (outcome.skipped) {
      logger.info({ threadId, organizationId, kind }, kind === 'handoff'
        ? '[Worker] Auto-ack skipped — customer already acknowledged while waiting'
        : '[Worker] Auto-ack skipped — no auto-acknowledgment message configured');
    } else {
      logger.info({ threadId, organizationId, kind }, '[Worker] Auto-ack sent to customer');
    }
  } catch (err) {
    logger.error({ err: (err as Error).message, threadId, kind }, '[Worker] sendAutoAck error');
  }
}

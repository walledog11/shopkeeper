import { db, type DbThreadRequestDisposition } from '@shopkeeper/db';
import type { OrgSettings } from '@shopkeeper/agent/types';
import { STATUS } from '../constants.js';
import logger from '../logger.js';
import { getConversationBurst, type ConversationBurst } from './conversation-burst.js';
import { requestAutoAck } from './planning-dashboard-client.js';
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
): boolean {
  if (!sourceMessageId) return false;
  const dispositionCoversBurst = skipSummary !== true
    || burst.messages[0]?.id === sourceMessageId;
  return thread?.requestSourceMessageId !== sourceMessageId
    || burst.messages.at(-1)?.id !== sourceMessageId
    || (dispositionCoversBurst && !mayParkMerchantWork(thread.requestDisposition));
}

export async function precomputeThreadPlan(
  organizationId: string,
  threadId: string,
  settings: Pick<OrgSettings, 'autoPlanOnOpen'>,
  options: { allowAutoExecute?: boolean; instruction?: string; sourceMessageId?: string; skipSummary?: boolean } = {},
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
    if (shouldSkipRequestWork(thread, burst, options.sourceMessageId, options.skipSummary)) {
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

// Best-effort customer auto-ack: failures are logged only so the ai-summary job
// still completes outside business hours.
export async function sendAutoAck(organizationId: string, threadId: string): Promise<void> {
  try {
    const response = await requestAutoAck(threadId);
    if (!response.ok) {
      logger.warn(
        { status: response.status, outcome: response.outcome, threadId, organizationId },
        response.outcome === 'unknown'
          ? '[Worker] Auto-ack dispatch outcome unknown'
          : '[Worker] Auto-ack dispatch failed',
      );
    } else if (response.data.skipped) {
      logger.warn({ threadId, organizationId }, '[Worker] Auto-ack skipped by dashboard — check businessHoursEnabled setting sync');
    } else {
      logger.info({ threadId, organizationId }, '[Worker] Auto-ack sent to customer');
    }
  } catch (err) {
    logger.error({ err: (err as Error).message, threadId }, '[Worker] sendAutoAck error');
  }
}

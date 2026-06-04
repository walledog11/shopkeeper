import { db } from '@clerk/db';
import * as Sentry from '@sentry/node';
import { STATUS } from '../constants.js';
import logger from '../logger.js';
import { requestAutoAck, requestThreadPlan } from './planning-dashboard-client.js';
import type { PrecomputedPlanResult } from './planning-types.js';

export async function precomputeThreadPlan(
  organizationId: string,
  threadId: string,
  settings: Record<string, unknown>,
  options: { allowAutoExecute?: boolean } = {},
): Promise<PrecomputedPlanResult | null> {
  if (settings.autoPlanOnOpen === false) {
    logger.warn({ threadId, organizationId }, '[Worker] autoPlanOnOpen disabled — no plan will be generated for this thread');
    return null;
  }

  try {
    const thread = await db.thread.findUnique({
      where: { id: threadId },
      select: { status: true },
    });
    if (!thread || thread.status !== STATUS.OPEN) {
      return null;
    }

    const response = await requestThreadPlan(
      organizationId,
      threadId,
      options.allowAutoExecute === true,
    );
    if (!response.ok) {
      logger.warn(
        {
          status: response.status,
          threadId,
          organizationId,
          responseBody: response.responseBody.slice(0, 500),
        },
        '[Worker] plan-internal failed during precompute',
      );
      throw new Error(`plan-internal returned ${response.status}: ${response.responseBody.slice(0, 200)}`);
    }

    const {
      plan,
      instruction,
      autoExecuted,
      autoExecutionStatus,
      autoExecutionSummary,
      autoExecutionActions,
      autoExecutionError,
    } = response.data;
    if (!plan?.steps || plan.steps.length === 0) {
      return null;
    }
    return {
      plan,
      instruction,
      ...(autoExecuted ? {
        autoExecuted: true,
        autoExecutionStatus,
        autoExecutionSummary,
        autoExecutionActions,
        autoExecutionError,
      } : {}),
    };
  } catch (err) {
    logger.error({ err: (err as Error).message, threadId, organizationId }, '[Worker] precomputeThreadPlan error');
    Sentry.captureException(err, {
      tags: { path: 'plan-precompute' },
      extra: { threadId, organizationId },
    });
    throw err;
  }
}

export async function sendAutoAck(organizationId: string, threadId: string): Promise<void> {
  try {
    const response = await requestAutoAck(threadId);
    if (!response.ok) {
      logger.warn({ status: response.status, threadId, organizationId }, '[Worker] Auto-ack dispatch failed');
    } else if (response.data.skipped) {
      logger.warn({ threadId, organizationId }, '[Worker] Auto-ack skipped by dashboard — check businessHoursEnabled setting sync');
    } else {
      logger.info({ threadId, organizationId }, '[Worker] Auto-ack sent to customer');
    }
  } catch (err) {
    logger.error({ err: (err as Error).message, threadId }, '[Worker] sendAutoAck error');
  }
}

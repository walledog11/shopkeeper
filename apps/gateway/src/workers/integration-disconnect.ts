import { Worker, type Job } from 'bullmq';
import {
  claimIntegrationDisconnect,
  completeIntegrationDisconnect,
  failIntegrationDisconnect,
  markIntegrationProviderCleaned,
  releaseIntegrationDisconnect,
} from '@shopkeeper/db';
import { postDashboardInternal } from '../clients/dashboard-internal.js';
import { QUEUE } from '../constants.js';
import logger from '../logger.js';
import type { IntegrationDisconnectJobData } from '../types.js';
import { registerJobFailureLogging } from './failure.js';
import type { SharedGatewayWorkerOptions } from './resources.js';

export interface IntegrationDisconnectWorkerRegistrationOptions {
  workerOptions: SharedGatewayWorkerOptions;
}

function isFinalAttempt(job: Job<IntegrationDisconnectJobData>): boolean {
  const attempts = typeof job.opts.attempts === 'number' ? job.opts.attempts : 1;
  return job.attemptsMade + 1 >= attempts;
}

export async function processIntegrationDisconnect(
  job: Job<IntegrationDisconnectJobData>,
): Promise<void> {
  const claimed = await claimIntegrationDisconnect(job.data.operationId);
  if (!claimed) {
    logger.info(
      { operationId: job.data.operationId },
      '[IntegrationDisconnect] Operation is not claimable — skipping duplicate job',
    );
    return;
  }

  try {
    const cleanup = await postDashboardInternal<{ cleaned: true }>(
      '/api/integrations/internal/disconnect-cleanup',
      {
        operationId: claimed.operation.id,
        claimToken: claimed.claimToken,
      },
      { requestId: claimed.operation.id },
    );
    if (!cleanup.ok || cleanup.data.cleaned !== true) {
      const detail = cleanup.ok
        ? 'Dashboard returned an invalid cleanup response'
        : `Dashboard cleanup ${cleanup.outcome}: ${cleanup.status ?? 'no status'} ${cleanup.responseBody}`;
      throw new Error(detail.slice(0, 1_000));
    }

    const providerRecorded = await markIntegrationProviderCleaned(
      claimed.operation.id,
      claimed.claimToken,
    );
    if (!providerRecorded) {
      logger.warn(
        { operationId: claimed.operation.id },
        '[IntegrationDisconnect] Claim changed after provider cleanup — leaving completion to current owner',
      );
      return;
    }

    const completed = await completeIntegrationDisconnect(
      claimed.operation.id,
      claimed.claimToken,
    );
    if (!completed) {
      logger.warn(
        { operationId: claimed.operation.id },
        '[IntegrationDisconnect] Claim changed before local completion',
      );
      return;
    }
    logger.info(
      {
        integrationId: claimed.operation.integrationId,
        operationId: claimed.operation.id,
        organizationId: claimed.operation.organizationId,
      },
      '[IntegrationDisconnect] Provider cleanup and local deletion completed',
    );
  } catch (error) {
    if (isFinalAttempt(job)) {
      await failIntegrationDisconnect(
        claimed.operation.id,
        claimed.claimToken,
        error,
      );
    } else {
      await releaseIntegrationDisconnect(
        claimed.operation.id,
        claimed.claimToken,
        error,
      );
    }
    throw error;
  }
}

export function createIntegrationDisconnectWorker(
  options: IntegrationDisconnectWorkerRegistrationOptions,
): Worker<IntegrationDisconnectJobData> {
  const worker = new Worker<IntegrationDisconnectJobData>(
    QUEUE.INTEGRATION_DISCONNECT,
    processIntegrationDisconnect,
    options.workerOptions,
  );

  registerJobFailureLogging(worker, {
    logMessage: '[IntegrationDisconnect] Job failed permanently',
    logFields: job => ({ jobId: job?.id }),
    failureExtra: job => ({
      opsAlert: true,
      jobId: job?.id,
      queue: QUEUE.INTEGRATION_DISCONNECT,
      operationId: job?.data?.operationId,
      organizationId: job?.data?.organizationId,
      attemptsMade: job?.attemptsMade,
    }),
  });
  return worker;
}

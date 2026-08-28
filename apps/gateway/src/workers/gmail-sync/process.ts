import {
  GmailApiClient,
  historyIdAtOrAfter,
  isGmailApiError,
  isValidGmailHistoryId,
  readStoredGmailHistoryId,
} from '@shopkeeper/email';
import { acquireGmailIntegrationLock } from '../../lib/gmail-sync-lock.js';
import logger from '../../logger.js';
import type { GmailSyncJobData } from '../../types.js';
import {
  GMAIL_OPERATOR_RECOVERY_MAX_MESSAGES,
  GMAIL_RECOVERY_MAX_MESSAGES,
  GMAIL_RECOVERY_QUERY,
} from './constants.js';
import { enqueueGmailMessages } from './enqueue.js';
import { isNativeGmailInboundEnabled } from './eligibility.js';
import {
  advanceCheckpoint,
  loadIntegration,
  markReauthorizationRequired,
} from './metadata.js';
import { recoverStaleHistory } from './recovery.js';
import type { GmailSyncProcessorDependencies } from './types.js';

export async function processGmailSyncJob(
  jobData: GmailSyncJobData,
  dependencies: GmailSyncProcessorDependencies,
): Promise<void> {
  const lock = await acquireGmailIntegrationLock(dependencies.redis, jobData.integrationId);
  const ensureLockOwned = async (): Promise<void> => {
    await lock.renew();
    lock.assertOwned();
  };
  try {
    const integration = await loadIntegration(jobData.integrationId);
    if (!integration) {
      logger.info({ integrationId: jobData.integrationId }, '[Gmail Sync] Integration no longer exists');
      return;
    }

    const storedHistoryId = readStoredGmailHistoryId(integration.metadata);
    const operatorRecovery = jobData.source === 'operator_recovery';
    if (
      !isNativeGmailInboundEnabled(integration, operatorRecovery)
      || !integration.refreshToken
      || !storedHistoryId
    ) {
      logger.info(
        { integrationId: integration.id },
        '[Gmail Sync] Integration is not eligible for native inbound sync',
      );
      return;
    }

    if (
      typeof jobData.notifiedHistoryId === 'string'
      && isValidGmailHistoryId(jobData.notifiedHistoryId)
      && historyIdAtOrAfter(storedHistoryId, jobData.notifiedHistoryId)
    ) {
      logger.info(
        { integrationId: integration.id, traceId: jobData.traceId },
        '[Gmail Sync] Notification is already covered by the checkpoint',
      );
      return;
    }

    const client = dependencies.createClient?.(integration) ?? new GmailApiClient(integration);
    const requestedRecoveryMax = operatorRecovery
      ? jobData.recoveryMaxMessages
      : dependencies.recoveryMaxMessages;
    const recoveryMaxMessages = requestedRecoveryMax === undefined
      ? GMAIL_RECOVERY_MAX_MESSAGES
      : requestedRecoveryMax;
    if (
      !Number.isInteger(recoveryMaxMessages)
      || recoveryMaxMessages < 1
      || recoveryMaxMessages > GMAIL_OPERATOR_RECOVERY_MAX_MESSAGES
    ) {
      throw new RangeError(
        `Gmail recoveryMaxMessages must be between 1 and ${GMAIL_OPERATOR_RECOVERY_MAX_MESSAGES}`,
      );
    }
    const recoveryQuery = operatorRecovery
      ? jobData.recoveryQuery?.trim() || GMAIL_RECOVERY_QUERY
      : GMAIL_RECOVERY_QUERY;
    if (recoveryQuery.length > 256) {
      throw new RangeError('Gmail recoveryQuery must be 256 characters or fewer');
    }
    let history;
    try {
      history = await client.listHistory({
        startHistoryId: storedHistoryId,
        historyTypes: ['messageAdded'],
      });
    } catch (error) {
      if (isGmailApiError(error) && error.kind === 'stale_history') {
        await recoverStaleHistory(
          integration,
          client,
          dependencies,
          jobData.traceId,
          ensureLockOwned,
          { maxMessages: recoveryMaxMessages, query: recoveryQuery },
        );
        return;
      }
      throw error;
    }

    const messageIds = new Set<string>();
    for (const record of history.history) {
      for (const added of record.messagesAdded ?? []) {
        messageIds.add(added.message.id);
      }
    }

    await enqueueGmailMessages(
      integration,
      messageIds,
      client,
      dependencies.inboundQueue,
      jobData.traceId,
    );

    // This write is deliberately last: any fetch, parse, or enqueue failure
    // leaves the old checkpoint intact so BullMQ can retry the whole range.
    await ensureLockOwned();
    await advanceCheckpoint(
      integration.id,
      history.historyId,
      dependencies.now?.() ?? new Date(),
    );
    logger.info(
      {
        integrationId: integration.id,
        messageCount: messageIds.size,
        traceId: jobData.traceId,
      },
      '[Gmail Sync] Mailbox history synchronized',
    );
  } catch (error) {
    if (isGmailApiError(error) && error.kind === 'authentication') {
      await markReauthorizationRequired(jobData.integrationId);
    }
    throw error;
  } finally {
    await lock.release();
  }
}

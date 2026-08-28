import type { GmailApiClient } from '@shopkeeper/email';
import {
  buildInboxWatchRequest,
  EmailNotConfiguredError,
} from '@shopkeeper/email';
import logger from '../../logger.js';
import { emitOpsAlert } from '../../ops-alerts.js';
import { GMAIL_RECOVERY_MAX_RESULTS } from './constants.js';
import { enqueueGmailMessages } from './enqueue.js';
import {
  establishRecoveredCheckpoint,
  markRecoveryIncomplete,
} from './metadata.js';
import type { GmailSyncIntegration, GmailSyncProcessorDependencies } from './types.js';

async function listRecoveryMessageIds(
  client: GmailApiClient,
  maxMessages: number,
  query: string,
): Promise<{ messageIds: Set<string>; truncated: boolean }> {
  const messageIds = new Set<string>();
  let pageToken: string | undefined;

  do {
    const remaining = maxMessages - messageIds.size;
    if (remaining <= 0) {
      return { messageIds, truncated: true };
    }
    const response = await client.listMessages({
      maxResults: Math.min(GMAIL_RECOVERY_MAX_RESULTS, remaining),
      ...(pageToken ? { pageToken } : {}),
      query,
      labelIds: ['INBOX'],
      includeSpamTrash: false,
    });
    for (const message of response.messages) messageIds.add(message.id);
    pageToken = response.nextPageToken;
  } while (pageToken);

  return { messageIds, truncated: false };
}

async function recordIncompleteRecovery(
  integration: GmailSyncIntegration,
  dependencies: GmailSyncProcessorDependencies,
  traceId: string,
  recoveredMessageCount: number,
  maxMessages: number,
): Promise<void> {
  const now = dependencies.now?.() ?? new Date();
  await markRecoveryIncomplete(integration.id, now);
  (dependencies.emitAlert ?? emitOpsAlert)({
    category: 'gmail_inbound',
    message: 'Gmail stale-history recovery exceeded its safe message bound',
    level: 'error',
    tags: { orgId: integration.organizationId },
    fingerprint: ['ops-alert', 'gmail_inbound', 'recovery_truncated', integration.id],
    extra: {
      integrationId: integration.id,
      maxMessages,
      recoveredMessageCount,
      traceId,
    },
  });
}

export async function recoverStaleHistory(
  integration: GmailSyncIntegration,
  client: GmailApiClient,
  dependencies: GmailSyncProcessorDependencies,
  traceId: string,
  ensureLockOwned: () => Promise<void>,
  options: { maxMessages: number; query: string },
): Promise<void> {
  const { maxMessages, query } = options;
  const recovery = await listRecoveryMessageIds(client, maxMessages, query);
  const messageIds = recovery.messageIds;
  const queuedCount = await enqueueGmailMessages(
    integration,
    messageIds,
    client,
    dependencies.inboundQueue,
    traceId,
  );
  if (recovery.truncated) {
    await ensureLockOwned();
    await recordIncompleteRecovery(
      integration,
      dependencies,
      traceId,
      messageIds.size,
      maxMessages,
    );
    return;
  }

  const topicName = process.env.GMAIL_PUBSUB_TOPIC?.trim();
  if (!topicName) {
    throw new EmailNotConfiguredError('Gmail Pub/Sub topic missing during stale-history recovery');
  }
  const watch = await client.watch(buildInboxWatchRequest(topicName));

  // Close the list-to-watch race: anything delivered after the first bounded
  // list but before the new watch baseline is visible in this second list.
  const catchUp = await listRecoveryMessageIds(client, maxMessages, query);
  const catchUpMessageIds = new Set(
    [...catchUp.messageIds]
      .filter((messageId) => !messageIds.has(messageId)),
  );
  const catchUpQueuedCount = await enqueueGmailMessages(
    integration,
    catchUpMessageIds,
    client,
    dependencies.inboundQueue,
    traceId,
  );
  if (catchUp.truncated) {
    await ensureLockOwned();
    await recordIncompleteRecovery(
      integration,
      dependencies,
      traceId,
      messageIds.size + catchUpMessageIds.size,
      maxMessages,
    );
    return;
  }

  // Recovery intentionally establishes a new baseline. This is the only path,
  // other than initial connection, that may replace an existing checkpoint.
  await ensureLockOwned();
  await establishRecoveredCheckpoint(
    integration.id,
    watch,
    dependencies.now?.() ?? new Date(),
  );
  logger.warn(
    {
      integrationId: integration.id,
      recoveredMessageCount: messageIds.size + catchUpMessageIds.size,
      queuedMessageCount: queuedCount + catchUpQueuedCount,
      traceId,
    },
    '[Gmail Sync] Recovered from a stale history checkpoint',
  );
}

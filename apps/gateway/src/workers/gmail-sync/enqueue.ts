import type { Queue } from 'bullmq';
import type { GmailApiClient } from '@shopkeeper/email';
import {
  detectEmailBounce,
  isForSupportAddress,
  normalizeInboundEmail,
  parseMime,
} from '@shopkeeper/email';
import { CHANNEL, JOB } from '../../constants.js';
import logger from '../../logger.js';
import { recordEmailBounce } from '../../message-handlers/email-bounce.js';
import { applyInboundAttachmentBudget } from '../../storage/attachment-budget.js';
import type { InboundJobData } from '../../types.js';
import { normalizeAddress, providerMessageKey } from './eligibility.js';
import { mapGmailMessagesWithConcurrency } from './helpers.js';
import type { GmailSyncIntegration } from './types.js';

export async function enqueueGmailMessages(
  integration: GmailSyncIntegration,
  messageIds: Iterable<string>,
  client: GmailApiClient,
  inboundQueue: Queue<InboundJobData>,
  traceId: string,
): Promise<number> {
  const merchantAddresses = new Set(
    [integration.externalAccountId, integration.fromEmail]
      .map(normalizeAddress)
      .filter((address): address is string => address !== null),
  );
  const supportAddress = integration.fromEmail || integration.externalAccountId;
  const results = await mapGmailMessagesWithConcurrency(
    [...messageIds],
    async (messageId): Promise<number> => {
      const message = await client.getMessageRaw(messageId);
      const labels = new Set(message.labelIds ?? []);
      if (!labels.has('INBOX') || labels.has('SENT')) return 0;

      // MIME parse failures are retryable by default. Only a successfully
      // parsed message that is explicitly unusable/filterable is skipped.
      let parsed;
      try {
        parsed = await parseMime(message.raw);
      } catch (error) {
        logger.warn(
          { gmailMessageId: message.id, integrationId: integration.id },
          '[Gmail Sync] MIME parse failed; retrying sync',
        );
        throw error;
      }
      // Gmail has no bounce webhook — a failed delivery comes back as mail from
      // the receiving system. Checked before the support-address filter, which a
      // daemon report addressed to the sending mailbox would otherwise drop.
      const bounce = detectEmailBounce(parsed);
      if (bounce) {
        const outcome = await recordEmailBounce({
          provider: 'gmail',
          locator: { kind: 'outbound_message_id', value: bounce.outboundMessageId },
          recipient: null,
          bounceType: bounce.permanent ? 'permanent' : 'transient',
          detail: bounce.detail,
          permanent: bounce.permanent,
        });
        logger.info(
          { gmailMessageId: message.id, integrationId: integration.id, outcome },
          '[Gmail Sync] Delivery status notification processed',
        );
        return 0;
      }

      if (parsed.from && merchantAddresses.has(parsed.from.toLowerCase())) return 0;
      if (!isForSupportAddress(parsed, supportAddress)) return 0;

      const normalized = normalizeInboundEmail(parsed);
      if (!normalized) {
        logger.warn(
          { gmailMessageId: message.id, integrationId: integration.id },
          '[Gmail Sync] Skipping non-actionable parsed message',
        );
        return 0;
      }
      const { accepted: attachments, rejected } = applyInboundAttachmentBudget(
        normalized.attachments,
      );
      if (rejected.length > 0) {
        logger.warn(
          {
            gmailMessageId: message.id,
            integrationId: integration.id,
            rejected: rejected.map(({ name, reason, bytes }) => ({ name, reason, bytes })),
          },
          '[Gmail Sync] Dropped inbound attachments over budget before queueing',
        );
      }

      const inboundMessageId = normalized.inboundMessageId || providerMessageKey(message.id);
      const internalDateMs = message.internalDate ? Number(message.internalDate) : Number.NaN;
      const receivedAt = Number.isFinite(internalDateMs) && internalDateMs >= 0
        ? new Date(internalDateMs).toISOString()
        : new Date().toISOString();
      await inboundQueue.add(
        JOB.EMAIL,
        {
          platform: CHANNEL.EMAIL,
          organizationId: integration.organizationId,
          integrationId: integration.id,
          receivedAt,
          senderEmail: normalized.senderEmail,
          senderName: normalized.senderName,
          subject: normalized.subject,
          body: normalized.body,
          inboundMessageId,
          traceId,
          ...(attachments.length > 0
            ? { attachments }
            : {}),
        },
        { jobId: `gmail-inbound-${integration.id}-${message.id}` },
      );
      return 1;
    },
  );

  return results.reduce((total, count) => total + count, 0);
}

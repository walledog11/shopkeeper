import { NextResponse } from 'next/server';
import { db } from '@shopkeeper/db';
import { readRequiredJsonObject } from '@/lib/api/body';
import { ApiError } from '@/lib/api/errors';
import { requireNonEmptyString } from '@/lib/api/validation';
import { assertEntityInOrg, withOrgRoute } from '@/lib/api/route';
import { resolveEmailIntegration } from '@shopkeeper/email/integration-resolution';
import { enqueueOutboundEmail } from '@/lib/messaging/enqueue-outbound-email';

// Re-enqueue a previously failed async outbound email (provider blip or orphaned
// by the sweeper). Flips the existing row back to `pending` and re-queues the
// send; reverts to `failed` if the enqueue hop itself fails.
export const POST = withOrgRoute(
  {
    context: 'Messages retry POST',
    errorMessage: 'Failed to retry message',
    requireBillingWriteAllowed: true,
    rateLimit: { key: 'messages:retry', limit: 60, windowSecs: 60 },
  },
  async ({ org, request }) => {
    const body = await readRequiredJsonObject(request);
    const messageId = requireNonEmptyString(body.messageId, 'messageId', 'Missing messageId');

    const message = await db.message.findUnique({ where: { id: messageId } });
    assertEntityInOrg(message, org.id, 'Message not found');
    if (message.sendStatus !== 'failed') {
      throw new ApiError('Message is not in a failed state', 400);
    }

    const integration = await resolveEmailIntegration({
      organizationId: org.id,
      purpose: 'reply',
      threadId: message.threadId,
      snapshotIntegrationId: message.integrationId,
    });

    await db.message.update({
      where: { id: messageId },
      data: {
        sendStatus: 'pending',
        sendClaimToken: null,
        sendClaimedAt: null,
        sendAttemptedAt: null,
        providerMessageId: null,
        sendError: null,
        integrationId: integration.id,
      },
    });

    const enqueued = await enqueueOutboundEmail({
      organizationId: org.id,
      messageId,
      threadId: message.threadId,
      integrationId: integration.id,
      source: 'dispatch_message',
    });

    if (enqueued === 'failed') {
      await db.message.update({
        where: { id: messageId },
        data: {
          sendStatus: 'failed',
          sendClaimToken: null,
          sendError: 'Could not queue email send',
        },
      });
      throw new ApiError('Could not queue email send', 502);
    }
    if (enqueued === 'unknown') {
      await db.message.updateMany({
        where: { id: messageId, sendStatus: 'pending' },
        data: {
          sendStatus: 'unknown',
          sendClaimToken: null,
          sendError: 'Email queue admission outcome unknown',
        },
      });
      throw new ApiError('Email queue admission could not be confirmed', 502);
    }

    return NextResponse.json({ ok: true });
  },
);

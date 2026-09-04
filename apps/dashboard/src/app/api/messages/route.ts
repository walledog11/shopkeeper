import { NextResponse } from 'next/server';
import { db, SenderType, createMessage } from '@shopkeeper/db';
import { getOutboundAttachmentLimits } from '@shopkeeper/email/attachment-load';
import { readRequiredJsonObject } from '@/lib/api/body';
import { ApiError, BadRequestError } from '@/lib/api/errors';
import { assertEntityInOrg, withOrgRoute } from '@/lib/api/route';
import { isOwnedAttachmentRef } from '@/lib/attachments/blob-ref';
import { parseSendMessageBody } from '@/app/api/messages/_lib/validation';
import { dispatchMessage } from '@/lib/messaging/dispatch-message';
import { recordMerchantReply } from '@/lib/messaging/merchant-reply';
import { captureVoiceEdit } from '@/lib/agent/voice-capture';
import logger from '@/lib/server/logger';

export const POST = withOrgRoute(
  {
    context: 'Messages POST',
    errorMessage: 'Failed to process message',
    requireBillingWriteAllowed: true,
    // 60 outbound messages per minute per org — prevents accidental or malicious message floods
    rateLimit: { key: 'messages:send', limit: 60, windowSecs: 60 },
  },
  async ({ org, request }) => {
    const { threadId, text, isNote, attachments } = parseSendMessageBody(
      await readRequiredJsonObject(request),
    );

    // The refs come from the client, so ownership is re-checked here rather
    // than trusted — the same org segment the read route authorizes against.
    // Byte totals are the loader's call; it is the one that reads real sizes.
    if (attachments.some(ref => !isOwnedAttachmentRef(ref, org.id))) {
      throw new BadRequestError('Unknown attachment');
    }
    const { maxCount } = getOutboundAttachmentLimits();
    if (attachments.length > maxCount) {
      throw new BadRequestError(`You can attach at most ${maxCount} files`);
    }

    const thread = await db.thread.findUnique({
      where: { id: threadId },
      include: { customer: true },
    });
    assertEntityInOrg(thread, org.id, 'Thread not found');

    if (isNote) {
      const message = await createMessage({
        threadId,
        senderType: SenderType.note,
        contentText: text,
        ...(attachments.length > 0 && { attachments }),
      });
      return NextResponse.json(message);
    }

    const result = await dispatchMessage(thread, org, text, { attachments });
    if (!result.ok) {
      throw new ApiError(result.error ?? 'Failed to send message', 502);
    }

    await recordMerchantReply(thread);

    // Brand-voice learning: if this reply diverges from the agent's drafted
    // reply, record the edit for the synthesis loop. Never let it fail the send.
    try {
      await captureVoiceEdit({
        organizationId: org.id,
        threadId,
        cachedPlan: thread.cachedPlan,
        tag: thread.tag,
        sentText: text,
      });
    } catch (err) {
      logger.error({ err, threadId }, '[Messages POST] Failed to capture voice edit');
    }

    return NextResponse.json(result.message);
  },
);

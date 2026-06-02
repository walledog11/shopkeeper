import { NextResponse } from 'next/server';
import { db, SenderType, createMessage } from '@clerk/db';
import { ApiError, BadRequestError } from '@/lib/api/errors';
import { assertEntityInOrg, withOrgRoute } from '@/lib/api/route';
import { dispatchMessage } from '@/lib/messaging/dispatch-message';
import { captureVoiceEdit } from '@/lib/agent/voice-capture';
import logger from '@/lib/server/logger';

export const POST = withOrgRoute(
  {
    context: 'Messages POST',
    errorMessage: 'Failed to process message',
    requireBillingWriteAllowed: true,
    // 60 outbound messages per minute per org , prevents accidental or malicious message floods
    rateLimit: { key: 'messages:send', limit: 60, windowSecs: 60 },
  },
  async ({ org, request }) => {
    const { threadId, text, isNote } = await request.json();

    if (!threadId || !text) {
      throw new BadRequestError('Missing threadId or text');
    }

    if (text.length > 4000) {
      throw new BadRequestError('Message too long');
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
      });
      return NextResponse.json(message);
    }

    const result = await dispatchMessage(thread, org, text);
    if (!result.ok) {
      throw new ApiError(result.error ?? 'Failed to send message', 502);
    }

    // Implicit-genuine feedback: replying to a non-genuine thread implies the merchant
    // sees it as legit. Promote filtered → genuine; capture feedback either way.
    if (thread.filterStatus !== 'genuine') {
      await db.thread.update({
        where: { id: threadId },
        data: {
          filterFeedback: 'confirmed_genuine',
          ...(thread.filterStatus === 'filtered' && { filterStatus: 'genuine' }),
        },
      });
    }

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

    const message = await db.message.findFirst({
      where: { threadId, senderType: SenderType.agent },
      orderBy: { sentAt: 'desc' },
    });

    return NextResponse.json(message);
  },
);

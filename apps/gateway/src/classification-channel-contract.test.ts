import './test-fixtures/worker-test-setup.js';
import type { Queue } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';
import { ChannelType, db } from '@shopkeeper/db';
import { processInboundMessage } from './message-handlers/inbound-persistence.js';
import type { AiSummaryJobData } from './types.js';
import { org } from './test-fixtures/worker-test-setup.js';
import {
  classifierResponse,
  getCapturedHandlers,
  getMockAnthropicCreate,
  makeEmailJob,
} from './test-fixtures/worker-test-helpers.js';

const REQUEST_TEXT = 'Please cancel order #1024 before Friday.';
const REQUEST_SUMMARY = 'Customer asks to cancel order #1024 before Friday.';
const REQUEST_FACTS = {
  ask: 'cancel',
  subject: null,
  order: '#1024',
  deadline: '2026-08-28',
  deadlineText: 'before Friday',
  alternative: null,
};

function classificationResponse(facts: Record<string, unknown> = REQUEST_FACTS) {
  return classifierResponse('questionable', {
    summary: REQUEST_SUMMARY,
    requestSummary: REQUEST_SUMMARY,
    requestDisposition: 'merchant_action',
    tag: 'Order Status',
    language: 'en',
    intents: { mutative_request: true },
    requestFacts: facts,
  });
}

function queueSpy() {
  const add = vi.fn().mockResolvedValue({ id: 'classification-contract-job' });
  return {
    add,
    queue: { add } as unknown as Queue<AiSummaryJobData>,
  };
}

async function persistedRequestContract(threadId: string) {
  const thread = await db.thread.findUniqueOrThrow({
    where: { id: threadId },
    select: {
      classifierSignals: true,
      requestDisposition: true,
      requestSourceMessageId: true,
      requestSummary: true,
    },
  });
  const source = thread.requestSourceMessageId
    ? await db.message.findUnique({
        where: { id: thread.requestSourceMessageId },
        select: { contentText: true, senderType: true, threadId: true },
      })
    : null;

  return {
    classifierSignals: thread.classifierSignals,
    requestDisposition: thread.requestDisposition,
    requestSummary: thread.requestSummary,
    sourceAligned: source?.threadId === threadId && source.senderType === 'customer',
    sourceText: source?.contentText ?? null,
  };
}

function runSummaryJob(data: AiSummaryJobData) {
  return getCapturedHandlers().get('ai-summary')!({
    id: `classification-contract-${data.sourceMessageId}`,
    data,
  });
}

describe('inbound classification channel contract', () => {
  it('persists the same versioned request contract before and after message persistence', async () => {
    getMockAnthropicCreate().mockResolvedValue(classificationResponse());

    await getCapturedHandlers().get('inbound-messages')!(makeEmailJob(org.id, {
      body: REQUEST_TEXT,
      subject: 'Cancel order #1024',
    }));
    const emailThread = await db.thread.findFirstOrThrow({
      where: { organizationId: org.id, channelType: ChannelType.email },
      include: { messages: { where: { senderType: 'customer' } } },
    });
    await runSummaryJob({
      threadId: emailThread.id,
      organizationId: org.id,
      sourceMessageId: emailThread.messages[0]!.id,
      customerName: 'Test Customer',
      channelType: ChannelType.email,
      skipSummary: true,
    });

    const { add, queue } = queueSpy();
    const storefront = await processInboundMessage(
      org.id,
      'classification-contract-shopper',
      ChannelType.shopify_chat,
      REQUEST_TEXT,
      queue,
      { customerName: 'Test Customer', isRealCustomerMessage: true },
    );
    expect(storefront?.isNew).toBe(true);
    const storefrontJob = add.mock.calls[0]![1] as AiSummaryJobData;
    await runSummaryJob(storefrontJob);

    expect(await persistedRequestContract(emailThread.id)).toEqual(
      await persistedRequestContract(storefront!.thread.id),
    );
    expect(await persistedRequestContract(emailThread.id)).toEqual({
      classifierSignals: {
        version: 5,
        language: 'en',
        intents: {
          mutative_request: true,
          policy_question: false,
          order_status: false,
          fraud_signals: false,
          contradiction: false,
          out_of_scope_commercial: false,
          forwarded_injection: false,
          no_request: false,
        },
        requestFacts: REQUEST_FACTS,
      },
      requestDisposition: 'merchant_action',
      requestSummary: REQUEST_SUMMARY,
      sourceAligned: true,
      sourceText: REQUEST_TEXT,
    });
  });

  it('rejects a post-persistence classification when a newer request arrives in flight', async () => {
    const firstQueue = queueSpy();
    const first = await processInboundMessage(
      org.id,
      'classification-contract-stale-shopper',
      ChannelType.shopify_chat,
      'Where is order #1024?',
      firstQueue.queue,
    );
    const firstJob = firstQueue.add.mock.calls[0]![1] as AiSummaryJobData;
    const trailingQueue = queueSpy();

    getMockAnthropicCreate().mockImplementationOnce(async () => {
      await processInboundMessage(
        org.id,
        'classification-contract-stale-shopper',
        ChannelType.shopify_chat,
        REQUEST_TEXT,
        trailingQueue.queue,
      );
      return classificationResponse({
        ...REQUEST_FACTS,
        ask: 'order_status',
        deadline: null,
        deadlineText: null,
      });
    });

    await runSummaryJob(firstJob);

    expect(await persistedRequestContract(first!.thread.id)).toMatchObject({
      classifierSignals: null,
      requestDisposition: null,
      requestSummary: null,
      sourceAligned: false,
      sourceText: null,
    });

    getMockAnthropicCreate().mockResolvedValueOnce(classificationResponse());
    const trailingJob = trailingQueue.add.mock.calls[0]![1] as AiSummaryJobData;
    await runSummaryJob(trailingJob);

    expect(await persistedRequestContract(first!.thread.id)).toMatchObject({
      classifierSignals: expect.objectContaining({
        version: 5,
        requestFacts: REQUEST_FACTS,
      }),
      requestDisposition: 'merchant_action',
      sourceAligned: true,
      sourceText: REQUEST_TEXT,
    });
  });

  it('classifies a follow-up email as one settled burst after the initial inline decision', async () => {
    getMockAnthropicCreate().mockResolvedValueOnce(classificationResponse({
      ...REQUEST_FACTS,
      ask: 'order_status',
      deadline: null,
      deadlineText: null,
    }));
    const inboundHandler = getCapturedHandlers().get('inbound-messages')!;
    await inboundHandler(makeEmailJob(org.id, {
      body: 'Where is order #1024?',
      inboundMessageId: 'classification-contract-email-1',
    }));

    await inboundHandler(makeEmailJob(org.id, {
      body: REQUEST_TEXT,
      inboundMessageId: 'classification-contract-email-2',
    }));
    expect(getMockAnthropicCreate()).toHaveBeenCalledTimes(1);

    const emailThread = await db.thread.findFirstOrThrow({
      where: { organizationId: org.id, channelType: ChannelType.email },
    });
    const latest = await db.message.findFirstOrThrow({
      where: {
        organizationId: org.id,
        threadId: emailThread.id,
        externalMessageId: 'classification-contract-email-2',
      },
    });
    getMockAnthropicCreate().mockResolvedValueOnce(classificationResponse());
    await runSummaryJob({
      threadId: emailThread.id,
      organizationId: org.id,
      sourceMessageId: latest.id,
      customerName: 'Test Customer',
      channelType: ChannelType.email,
    });

    expect(getMockAnthropicCreate()).toHaveBeenCalledTimes(2);
    expect(await persistedRequestContract(emailThread.id)).toMatchObject({
      classifierSignals: expect.objectContaining({
        version: 5,
        requestFacts: REQUEST_FACTS,
      }),
      requestDisposition: 'merchant_action',
      sourceAligned: true,
      sourceText: REQUEST_TEXT,
    });
  });
});

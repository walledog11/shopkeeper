import './test-fixtures/worker-test-setup.js';
import type { Queue } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';
import { ChannelType, db } from '@shopkeeper/db';
import { processInboundMessage } from './message-handlers/inbound-persistence.js';
import type { ClassificationResult } from './message-handlers/classification.js';
import type { RequestFacts } from '@shopkeeper/agent/classifier-signals';
import type { AiSummaryJobData } from './types.js';
import { CLASSIFIER_VERSION } from './message-handlers/classification.js';
import { getWorkerTestState, org } from './test-fixtures/worker-test-setup.js';
import {
  classifierResponse,
  getCapturedHandlers,
  getMockAnthropicCreate,
  makeEmailJob,
} from './test-fixtures/worker-test-helpers.js';

const REQUEST_TEXT = 'Please cancel order #1024 before Friday.';
const REQUEST_SUMMARY = 'Customer asks to cancel order #1024 before Friday.';
const REQUEST_FACTS: RequestFacts = {
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

function classificationResult(): ClassificationResult {
  return {
    title: 'Cancel order #1024',
    summary: REQUEST_SUMMARY,
    tag: 'Order Status',
    filterStatus: 'genuine',
    filterReason: '',
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
    language: 'en',
    requestSummary: REQUEST_SUMMARY,
    requestDisposition: 'merchant_action',
    requestFacts: REQUEST_FACTS,
  };
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

// The stale-write metric. Both guards report through one event, so a rejected
// write is countable in production instead of being a silent no-op.
function classificationWriteEvents() {
  return getWorkerTestState().mockLogger.info.mock.calls
    .filter((call) => call[1] === '[Worker] Classification request write')
    .map((call) => call[0]);
}

// The user content each path actually sent to the model. The prompt resolves
// `deadline` against a "Today" line, so a path that omits one leaves the model
// guessing the year — production returned 2024-01-05 and then 2025-01-10 for
// "before Friday" on 2026-08-25, because only the email path sent it.
function classifierUserContents(): string[] {
  return getMockAnthropicCreate().mock.calls.map((call) => {
    const messages = (call[0] as { messages: Array<{ content: unknown }> }).messages;
    return String(messages[0]?.content ?? '');
  });
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

    // Both paths, not just the email one. This is the divergence the contract
    // unification missed: it compared the guard, the schema, the token budget,
    // and the write projections, and never compared the message input.
    const contents = classifierUserContents();
    expect(contents).toHaveLength(2);
    const today = new Date().toISOString().slice(0, 10);
    for (const content of contents) {
      expect(content.startsWith(`Today: ${today}\n\n`)).toBe(true);
    }
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

    expect(classificationWriteEvents()).toEqual([
      expect.objectContaining({
        path: 'post_persistence',
        outcome: 'rejected_stale',
        classifierVersion: CLASSIFIER_VERSION,
      }),
      expect.objectContaining({ path: 'post_persistence', outcome: 'committed' }),
    ]);
  });

  // The pre-persistence counterpart to the compare-and-set above. lastMessageAt
  // has always refused to move backwards; the request fields beside it used to
  // be written by an unguarded update, so an out-of-order message described the
  // thread's current request with an older one while lastMessageAt correctly
  // held the newer.
  //
  // Reachability was narrow — channels.ts sets `precomputed` only when the email
  // opens a thread (`!hasOpenThread`), and one worker at BullMQ's default
  // concurrency of 1 serializes — so this was a landmine rather than an active
  // bug. It widens the moment a second caller passes `precomputed` or the
  // gateway runs more than one replica. This drives processInboundMessage
  // directly to pin the write's own contract, independent of how a caller
  // reaches it.
  it('refuses to overwrite email request fields with an out-of-order message', async () => {
    const newer = new Date('2026-08-25T12:00:00.000Z');
    const older = new Date('2026-08-25T11:00:00.000Z');
    const { queue } = queueSpy();

    const first = await processInboundMessage(
      org.id,
      'classification-contract-race@example.com',
      ChannelType.email,
      'Newer request: cancel order #1024.',
      queue,
      {
        customerName: 'Test Customer',
        isRealCustomerMessage: true,
        externalMessageId: 'classification-contract-race-newer',
        receivedAt: newer,
        precomputed: {
          ...classificationResult(),
          requestSummary: 'Newer request: cancel order #1024.',
        },
      },
    );

    await processInboundMessage(
      org.id,
      'classification-contract-race@example.com',
      ChannelType.email,
      'Older request: where is order #1024?',
      queue,
      {
        customerName: 'Test Customer',
        isRealCustomerMessage: true,
        externalMessageId: 'classification-contract-race-older',
        receivedAt: older,
        precomputed: {
          ...classificationResult(),
          requestSummary: 'Older request: where is order #1024?',
        },
      },
    );

    const thread = await db.thread.findUniqueOrThrow({
      where: { id: first!.thread.id },
      select: { lastMessageAt: true, requestSummary: true },
    });

    // One guard, one answer: both halves held the newer message.
    expect(thread.lastMessageAt).toEqual(newer);
    expect(thread.requestSummary).toBe('Newer request: cancel order #1024.');
    expect(await persistedRequestContract(first!.thread.id)).toMatchObject({
      sourceText: 'Newer request: cancel order #1024.',
    });

    // The rejection is reported, not silent: before this the guard was an
    // updateMany whose zero count nothing read.
    expect(classificationWriteEvents()).toEqual([
      expect.objectContaining({
        path: 'pre_persistence',
        outcome: 'committed',
        classifierVersion: CLASSIFIER_VERSION,
      }),
      expect.objectContaining({ path: 'pre_persistence', outcome: 'rejected_stale' }),
    ]);
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

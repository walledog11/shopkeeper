import './test-fixtures/worker-test-setup.js';
import { describe, it, expect, vi } from 'vitest';
import { ChannelType, db } from '@shopkeeper/db';
import { org } from './test-fixtures/worker-test-setup.js';
import {
  classifierResponse,
  getCapturedHandlers,
  getMockAnthropicCreate,
  getMockFetch,
} from './test-fixtures/worker-test-helpers.js';

describe('AI Summary worker — filter gating', () => {
  it('skips plan precompute and operator notification when filterStatus is questionable', async () => {
    getMockAnthropicCreate().mockResolvedValueOnce(
      classifierResponse('questionable', { language: 'es', intents: { order_status: true } }),
    );

    const fetchUrls: string[] = [];
    getMockFetch().mockImplementation((url: string) => {
      fetchUrls.push(String(url));
      return Promise.resolve({ ok: true, json: vi.fn().mockResolvedValue({}), text: vi.fn().mockResolvedValue('') });
    });

    const customer = await db.customer.create({
      data: { organizationId: org.id, platformId: 'questionable@example.com' },
    });
    const thread = await db.thread.create({
      data: { organizationId: org.id, customerId: customer.id, channelType: ChannelType.email, status: 'open' },
    });
    await db.message.create({
      data: { threadId: thread.id, organizationId: org.id, senderType: 'customer', contentText: 'hey there' },
    });

    const aiHandler = getCapturedHandlers().get('ai-summary');
    expect(aiHandler).toBeDefined();
    await aiHandler!({
      id: 'ai-job',
      data: {
        threadId: thread.id,
        organizationId: org.id,
        customerName: 'Q',
        channelType: ChannelType.email,
        traceId: 'trace-q',
      },
    });

    const planInternalCalls = fetchUrls.filter(u => u.includes('/api/agent/plan-internal'));
    expect(planInternalCalls).toHaveLength(0);

    const updated = await db.thread.findUnique({ where: { id: thread.id } });
    expect(updated?.filterStatus).toBe('questionable');
    expect(updated?.classifierSignals).toEqual({
      version: 4,
      language: 'es',
      intents: {
        mutative_request: false,
        policy_question: false,
        order_status: true,
        fraud_signals: false,
        contradiction: false,
        out_of_scope_commercial: false,
        forwarded_injection: false,
        no_request: false,
      },
    });
  });

  it('skips plan precompute and operator notification when filterStatus is filtered', async () => {
    getMockAnthropicCreate().mockResolvedValueOnce(classifierResponse('filtered'));

    const fetchUrls: string[] = [];
    getMockFetch().mockImplementation((url: string) => {
      fetchUrls.push(String(url));
      return Promise.resolve({ ok: true, json: vi.fn().mockResolvedValue({}), text: vi.fn().mockResolvedValue('') });
    });

    const customer = await db.customer.create({
      data: { organizationId: org.id, platformId: 'spam@example.com' },
    });
    const thread = await db.thread.create({
      data: { organizationId: org.id, customerId: customer.id, channelType: ChannelType.email, status: 'open' },
    });
    await db.message.create({
      data: { threadId: thread.id, organizationId: org.id, senderType: 'customer', contentText: 'buy now' },
    });

    const aiHandler = getCapturedHandlers().get('ai-summary');
    await aiHandler!({
      id: 'ai-job-filtered',
      data: {
        threadId: thread.id,
        organizationId: org.id,
        customerName: null,
        channelType: ChannelType.email,
        traceId: 'trace-f',
      },
    });

    const planInternalCalls = fetchUrls.filter(u => u.includes('/api/agent/plan-internal'));
    expect(planInternalCalls).toHaveLength(0);

    const updated = await db.thread.findUnique({ where: { id: thread.id } });
    expect(updated?.filterStatus).toBe('filtered');
  });
});

describe('AI Summary worker — filter scope past email', () => {
  async function classifyThreadOnChannel(
    channelType: ChannelType,
    verdict: 'genuine' | 'questionable' | 'filtered',
    messageText: string,
  ) {
    // Not `Once`: a verdict that leaves the thread genuine falls through to plan
    // precompute, which runs the planner in-process against the same client.
    getMockAnthropicCreate().mockResolvedValue(classifierResponse(verdict));
    getMockFetch().mockImplementation(() => Promise.resolve({
      ok: true,
      json: vi.fn().mockResolvedValue({}),
      text: vi.fn().mockResolvedValue(''),
    }));

    const customer = await db.customer.create({
      data: { organizationId: org.id, platformId: `scope-${channelType}-${verdict}-${Date.now()}` },
    });
    const thread = await db.thread.create({
      data: { organizationId: org.id, customerId: customer.id, channelType, status: 'open' },
    });
    await db.message.create({
      data: { threadId: thread.id, organizationId: org.id, senderType: 'customer', contentText: messageText },
    });

    await getCapturedHandlers().get('ai-summary')!({
      id: `ai-job-${channelType}-${verdict}`,
      data: {
        threadId: thread.id,
        organizationId: org.id,
        customerName: null,
        channelType,
        traceId: `trace-${channelType}-${verdict}`,
      },
    });

    return db.thread.findUnique({ where: { id: thread.id } });
  }

  // The guarantee, and the reason it is a channel rule rather than prompt
  // wording: the operator channel can relist a flagged ticket and cannot relist
  // a filtered one, so `filtered` on the storefront is a shopper binned with no
  // way back. The verdict still lands — it just lands where it is reversible.
  it('caps a storefront spam verdict at questionable instead of binning it', async () => {
    const updated = await classifyThreadOnChannel(
      ChannelType.shopify_chat,
      'filtered',
      'Grow your store 10x — reply for our SEO package',
    );

    expect(updated?.filterStatus).toBe('questionable');
    expect(updated?.filterDecidedAt).not.toBeNull();
  });

  it('leaves a substantive storefront question genuine', async () => {
    const updated = await classifyThreadOnChannel(
      ChannelType.shopify_chat,
      'genuine',
      'Does the linen shirt run small? I usually wear a medium.',
    );

    expect(updated?.filterStatus).toBe('genuine');
    expect(updated?.filterDecidedAt).not.toBeNull();
  });

  // The reason the scope was email-only in the first place. A `shopify` thread
  // holds order-webhook notes that read as automated alerts to any classifier,
  // so it takes no filter decision at all and the lock stays open.
  it('takes no filter decision on a Shopify order-event thread', async () => {
    const updated = await classifyThreadOnChannel(
      ChannelType.shopify,
      'filtered',
      'Order #1026 has been updated.',
    );

    expect(updated?.filterStatus).toBe('genuine');
    expect(updated?.filterDecidedAt).toBeNull();
  });
});

describe('AI Summary worker — current request', () => {
  async function threadWithAnsweredHistory() {
    const customer = await db.customer.create({
      data: { organizationId: org.id, platformId: `request-${Date.now()}@example.com` },
    });
    const thread = await db.thread.create({
      data: { organizationId: org.id, customerId: customer.id, channelType: ChannelType.email, status: 'open' },
    });
    // An exchange the shop already closed out, then the burst that is actually
    // outstanding. The two must not be summarised as one request.
    await db.message.create({
      data: {
        threadId: thread.id,
        organizationId: org.id,
        senderType: 'customer',
        contentText: 'I want a refund for order #1024',
        sentAt: new Date('2026-08-11T10:00:00Z'),
      },
    });
    await db.message.create({
      data: {
        threadId: thread.id,
        organizationId: org.id,
        senderType: 'agent',
        contentText: 'Refunded that for you.',
        sentAt: new Date('2026-08-11T10:05:00Z'),
      },
    });
    const current = await db.message.create({
      data: {
        threadId: thread.id,
        organizationId: org.id,
        senderType: 'customer',
        contentText: 'Do you ship to Canada?',
        sentAt: new Date('2026-08-14T09:00:00Z'),
      },
    });
    return { thread, current };
  }

  function runSummaryJob(threadId: string) {
    return getCapturedHandlers().get('ai-summary')!({
      id: 'ai-job',
      data: {
        threadId,
        organizationId: org.id,
        customerName: 'R',
        channelType: ChannelType.email,
        traceId: 'trace-request',
      },
    });
  }

  it('stores the request separately from the episode summary and names the burst to the model', async () => {
    // Not `Once`: a genuine verdict falls through to plan precompute, which runs
    // the planner in-process against this same client.
    getMockAnthropicCreate().mockResolvedValue(
      classifierResponse('genuine', {
        summary: 'Customer was refunded for #1024 and now asks about Canada shipping.',
        requestSummary: 'Customer asks whether the shop ships to Canada.',
        requestDisposition: 'informational',
      }),
    );
    getMockFetch().mockImplementation(() => Promise.resolve({
      ok: true,
      json: vi.fn().mockResolvedValue({}),
      text: vi.fn().mockResolvedValue(''),
    }));
    const { thread, current } = await threadWithAnsweredHistory();

    await runSummaryJob(thread.id);

    const updated = await db.thread.findUnique({ where: { id: thread.id } });
    expect(updated?.aiSummary).toBe('Customer was refunded for #1024 and now asks about Canada shipping.');
    expect(updated?.requestSummary).toBe('Customer asks whether the shop ships to Canada.');
    expect(updated?.requestDisposition).toBe('informational');
    // Points at the newest customer message, which is what compare-and-set reads.
    expect(updated?.requestSourceMessageId).toBe(current.id);

    // The burst is marked in the input rather than left to be inferred: the
    // model is told which messages are the current ask, and the answered refund
    // is not among them.
    // calls[0] is the classifier; the mock is reset per test, and anything after
    // it belongs to plan precompute.
    const sentInput = getMockAnthropicCreate().mock.calls[0][0].messages[0].content as string;
    const currentRequestBlock = sentInput.slice(sentInput.indexOf('--- CURRENT REQUEST ---'));
    expect(currentRequestBlock).toContain('Do you ship to Canada?');
    expect(currentRequestBlock).not.toContain('I want a refund for order #1024');
  });

  it('discards a request summary the customer has already superseded', async () => {
    const { thread, current } = await threadWithAnsweredHistory();

    // A newer message lands while the model call is in flight, so the summary
    // coming back describes an ask that is no longer the newest one.
    getMockAnthropicCreate().mockImplementationOnce(async () => {
      await db.message.create({
        data: {
          threadId: thread.id,
          organizationId: org.id,
          senderType: 'customer',
          contentText: 'actually never mind, cancel the whole order',
          sentAt: new Date('2026-08-14T09:01:00Z'),
        },
      });
      return classifierResponse('genuine', {
        requestSummary: 'Customer asks whether the shop ships to Canada.',
        requestDisposition: 'informational',
      });
    });
    // Plan precompute runs after a genuine verdict and shares this client.
    getMockAnthropicCreate().mockResolvedValue(classifierResponse('genuine'));
    getMockFetch().mockImplementation(() => Promise.resolve({
      ok: true,
      json: vi.fn().mockResolvedValue({}),
      text: vi.fn().mockResolvedValue(''),
    }));

    await runSummaryJob(thread.id);

    const updated = await db.thread.findUnique({ where: { id: thread.id } });
    // The episode summary still lands — it stays true however the conversation
    // moved on. The request half is dropped rather than instructing the planner
    // to answer a shipping question when the shopper just asked to cancel.
    expect(updated?.aiSummary).toBe('Customer asked about their order.');
    expect(updated?.requestSummary).toBeNull();
    expect(updated?.requestDisposition).toBeNull();
    expect(updated?.requestSourceMessageId).not.toBe(current.id);
    expect(updated?.requestSourceMessageId).toBeNull();
    expect(updated?.classifierSignals).toBeNull();
  });
});

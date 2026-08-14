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
      version: 3,
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

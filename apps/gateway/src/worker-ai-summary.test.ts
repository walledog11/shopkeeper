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
    getMockAnthropicCreate().mockResolvedValueOnce(classifierResponse('questionable'));

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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@clerk/db';
import { cleanupTestData, createTestOrg } from '@clerk/db/test-helpers';
import { executeToolWithStatus } from './executor';
import type { BaseAgentContext } from '../types';

// Track 1 (thread-optional core): the executor must run on a BaseAgentContext that
// carries no thread and no customer. Support always passes a SupportContext, so the
// thread-less branches below are never hit on the support path - these tests prove
// the seams (lazy thread ctx, guarded kbCitation, injected escalate) hold structurally.

let org!: Awaited<ReturnType<typeof createTestOrg>>;

beforeEach(async () => {
  org = await createTestOrg();
});

afterEach(async () => {
  await cleanupTestData(org?.id);
});

function threadlessCtx(escalate: (reason: string) => Promise<void>): BaseAgentContext {
  return {
    orgId: org.id,
    orgName: org.name,
    customerMemory: null,
    recentMessages: [],
    shopify: null,
    escalate,
  };
}

describe('executeToolWithStatus on a thread-less BaseAgentContext', () => {
  it('returns the no-Shopify error for a Shopify read without throwing', async () => {
    const ctx = threadlessCtx(vi.fn());

    const result = await executeToolWithStatus(
      'get_shopify_orders',
      { customer_email: 'someone@example.com' },
      ctx,
    );

    expect(result.status).toBe('error');
    expect(result.result).toBe('Error: no Shopify integration connected.');
  });

  it('returns matching KB articles without writing a kbCitation when there is no thread', async () => {
    const kb = await db.knowledgeBase.create({
      data: { organizationId: org.id, name: 'Test KB', source: 'user' },
    });
    await db.kbArticle.create({
      data: {
        organizationId: org.id,
        knowledgeBaseId: kb.id,
        title: 'Returns policy',
        body: 'We accept returns within 30 days.',
      },
    });

    const ctx = threadlessCtx(vi.fn());
    const result = await executeToolWithStatus('search_kb', { query: 'returns' }, ctx);

    expect(result.status).toBe('success');
    expect(result.result).toContain('Returns policy');

    const citations = await db.kbCitation.count({ where: { organizationId: org.id } });
    expect(citations).toBe(0);
  });

  it('routes escalate_to_human through the injected sink', async () => {
    const escalate = vi.fn().mockResolvedValue(undefined);
    const ctx = threadlessCtx(escalate);

    const result = await executeToolWithStatus(
      'escalate_to_human',
      { reason: 'Suspected fraudulent order.' },
      ctx,
    );

    expect(result.status).toBe('escalated');
    expect(escalate).toHaveBeenCalledWith('Suspected fraudulent order.');
  });
});

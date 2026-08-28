import { afterEach, describe, expect, it, vi } from 'vitest';
import { db } from '@shopkeeper/db';
import { createTestOrg, cleanupTestData } from '@shopkeeper/db/test-helpers';
import { recordAgentActionsBatch } from '@shopkeeper/agent/agent-actions';
import { runOrderOps, type OrderForReview, type OrderOpsContext } from '@shopkeeper/agent/order-ops';
import { readFlagOrderFinding } from '@shopkeeper/agent/order-ops-finding';

// The model is stubbed here (unlike order-ops.eval.test.ts, which gates judgment
// against the real model). This file gates PERSISTENCE: given a decision to flag,
// the finding must reach the database through the real runOrderOps path.
const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class Anthropic {
    messages = { create: mockCreate };
  },
}));

// Order-ops finding, substantiated: the audit log is NOT thread-locked. The
// order-ops run records its flag action with threadId/customerId null and the
// row persists and is queryable. The only place that forced a thread was
// run.ts's call site (it passed ctx.thread.id / ctx.customer.id), not the schema
// or recordAgentActionsBatch (threadId/customerId are String? with onDelete: SetNull).
//
// Lives in the gateway (not the @shopkeeper/agent package) because it needs the real
// DB: the package's test:unit runs in CI's no-DB unit job, while the gateway's
// suite runs in the DB-backed integration job — same precedent as refund-spend.

let orgId: string | null = null;

afterEach(async () => {
  await cleanupTestData(orgId);
  orgId = null;
});

describe('order-ops thread-less audit', () => {
  it('persists a flag action with no thread or customer', async () => {
    const org = await createTestOrg();
    orgId = org.id;

    await recordAgentActionsBatch({
      orgId: org.id,
      threadId: null,
      customerId: null,
      mode: 'auto_executed',
      instruction: 'order-risk-review:998877',
      summary: 'Flagged order #1001 for review: billing/shipping country mismatch.',
      actions: [
        {
          tool: 'flag_order',
          result: 'Order flagged for human review: billing/shipping country mismatch.',
          input: { reason: 'billing/shipping country mismatch' },
          durationMs: 5,
          status: 'success',
          category: 'action',
        },
      ],
    });

    const rows = await db.agentAction.findMany({ where: { organizationId: org.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].threadId).toBeNull();
    expect(rows[0].customerId).toBeNull();
    expect(rows[0].tool).toBe('flag_order');
    expect(rows[0].mode).toBe('auto_executed');
    expect(rows[0].category).toBe('action');
  });
});

// Closes the gap the worker's unit test leaves open: order-review.unit.test.ts
// mocks runOrderOps outright, so nothing exercised the flag -> audit-row path for
// real. This drives runOrderOps itself against the real DB.
describe('order-ops finding persistence', () => {
  function makeOrder(): OrderForReview {
    return {
      id: '998877',
      name: '#1001',
      createdAt: new Date().toISOString(),
      financialStatus: 'paid',
      fulfillmentStatus: null,
      totalPrice: '640.00',
      currency: 'USD',
      customer: { id: '55', email: 'new@buyer.com', ordersCount: 1, createdAt: new Date().toISOString() },
      billing: { city: 'Austin', province: 'TX', country: 'United States' },
      shipping: { city: 'Lagos', province: null, country: 'Nigeria' },
      riskSignals: [
        {
          code: 'billing_shipping_country_mismatch',
          detail: 'Billing country United States differs from shipping country Nigeria.',
        },
      ],
    };
  }

  it('persists a flag raised by a real runOrderOps run under a per-order instruction key', async () => {
    const org = await createTestOrg();
    orgId = org.id;

    const reason = 'billing/shipping country mismatch on a high-value first order';
    mockCreate.mockResolvedValueOnce({
      stop_reason: 'tool_use',
      content: [{ type: 'tool_use', id: 'tu_1', name: 'flag_order', input: { reason } }],
      usage: { input_tokens: 120, output_tokens: 40 },
    });

    const escalations: string[] = [];
    const ctx: OrderOpsContext = {
      orgId: org.id,
      orgName: 'Audit Store',
      recentMessages: [],
      shopify: { shop: 'order-ops-audit.myshopify.com', accessToken: 'audit-token', grantedScopes: [] },
      escalate: async (r: string) => {
        escalations.push(r);
      },
      order: makeOrder(),
    };

    const result = await runOrderOps(ctx);

    expect(result.flagged).toBe(true);
    expect(escalations).toEqual([reason]);

    const rows = await db.agentAction.findMany({ where: { organizationId: org.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].tool).toBe('flag_order');
    expect(rows[0].threadId).toBeNull();
    expect(rows[0].customerId).toBeNull();
    // Load-bearing, not cosmetic: runOrderOps only sets flagReason when this
    // status is exactly "escalated". A row that says "success" means the run
    // called flag_order but did not register as flagged.
    expect(rows[0].status).toBe('escalated');
    // The dedupe key any re-review guard would key off: one order, one review.
    expect(rows[0].instruction).toBe('order-risk-review:998877');
    // The identity the dashboard renders. It used to be recoverable only by
    // regex-matching the summary sentence, in two places, with two different
    // regexes; the row carries it structurally now.
    expect(rows[0].input).toMatchObject({
      reason,
      orderId: '998877',
      orderName: '#1001',
    });
    expect(readFlagOrderFinding(rows[0])).toEqual({
      orderId: '998877',
      orderName: '#1001',
      reason,
    });
  });

  it('writes no finding and spends nothing when the pre-scan produces no signals', async () => {
    const org = await createTestOrg();
    orgId = org.id;
    mockCreate.mockReset();

    const ctx: OrderOpsContext = {
      orgId: org.id,
      orgName: 'Audit Store',
      recentMessages: [],
      shopify: { shop: 'order-ops-audit.myshopify.com', accessToken: 'audit-token', grantedScopes: [] },
      escalate: async () => {},
      order: { ...makeOrder(), riskSignals: [] },
    };

    const result = await runOrderOps(ctx);

    expect(result.flagged).toBe(false);
    expect(mockCreate).not.toHaveBeenCalled();
    await expect(db.agentAction.count({ where: { organizationId: org.id } })).resolves.toBe(0);
  });
});

import { afterEach, describe, expect, it } from 'vitest';
import { db } from '@clerk/db';
import { createTestOrg, cleanupTestData } from '@clerk/db/test-helpers';
import { recordAgentActionsBatch } from '@clerk/agent/agent-actions';

// Order-ops finding, substantiated: the audit log is NOT thread-locked. The
// order-ops run records its flag action with threadId/customerId null and the
// row persists and is queryable. The only place that forced a thread was
// run.ts's call site (it passed ctx.thread.id / ctx.customer.id), not the schema
// or recordAgentActionsBatch (threadId/customerId are String? with onDelete: SetNull).
//
// Lives in the gateway (not the @clerk/agent package) because it needs the real
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

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@shopkeeper/db';
import {
  createTestOrg,
  createTestCustomer,
  createTestThread,
  cleanupTestData,
} from '@shopkeeper/db/test-helpers';
import { renderOperatorLedger } from './operator-ledger.js';
import type { OperatorContext } from '../operator-context.js';

let org!: Awaited<ReturnType<typeof createTestOrg>>;

const EMPTY: OperatorContext = {
  pendingPlan: null,
  pendingDigest: null,
  pendingQuestion: null,
};

beforeEach(async () => {
  org = await createTestOrg();
});

afterEach(async () => {
  await cleanupTestData(org?.id);
});

describe('renderOperatorLedger', () => {
  it('reports nothing pending when the context is empty', async () => {
    const ledger = await renderOperatorLedger(org.id, EMPTY);
    expect(ledger).toBe("Nothing is awaiting the merchant's decision.");
  });

  it('renders a pending plan with customer, summary, steps, and the draft body', async () => {
    const customer = await createTestCustomer(org.id, 'cust@example.com', { name: 'Jane Doe' });
    const thread = await createTestThread(org.id, customer.id, 'email', { tag: 'Support' });

    const ledger = await renderOperatorLedger(org.id, {
      ...EMPTY,
      pendingPlan: {
        threadId: thread.id,
        instruction: 'Refund request for a late order',
        rawToolCalls: [
          { id: 'tc1', name: 'get_shopify_orders', input: { customer_id: '1' } },
          { id: 'tc1b', name: 'search_shopify_products', input: { query: 'shirt' } },
          { id: 'tc1bb', name: 'search_shopify_customers', input: { query: 'jane' } },
          { id: 'tc1c', name: 'get_order_tracking', input: { order_id: '1' } },
          { id: 'tc1d', name: 'get_support_stats', input: {} },
          { id: 'tc2', name: 'create_refund', input: { order_id: '1', amount: 12 } },
          { id: 'tc3', name: 'send_reply', input: { text: 'Refunded $12 for the delay — sorry about that!' } },
        ],
      },
    });

    expect(ledger).toContain("A drafted plan is awaiting the merchant's decision:");
    expect(ledger).toContain(`Ticket: ${thread.id} (customer: Jane Doe)`);
    expect(ledger).toContain('Refund request for a late order');
    expect(ledger).toContain('Actions it will take:');
    // Read tools are dropped from the action list.
    expect(ledger).not.toContain('get_shopify_orders');
    expect(ledger).not.toContain('search_shopify_products');
    expect(ledger).not.toContain('search_shopify_customers');
    expect(ledger).not.toContain('get_order_tracking');
    expect(ledger).not.toContain('get_support_stats');
    expect(ledger).toContain('Draft message the merchant is approving:');
    expect(ledger).toContain('Refunded $12 for the delay');
  });

  it('renders a pending question', async () => {
    const ledger = await renderOperatorLedger(org.id, {
      ...EMPTY,
      pendingQuestion: { threadId: 'ticket_1', question: 'Do we ship to Canada?' },
    });
    expect(ledger).toContain("A question is awaiting the merchant's answer:");
    expect(ledger).toContain('Do we ship to Canada?');
  });

  it('renders a pending digest with indexed flagged tickets and untrusted summaries', async () => {
    const customer = await createTestCustomer(org.id, 'sarah@example.com', { name: 'Sarah Jones' });
    const thread = await createTestThread(org.id, customer.id, 'email');
    await db.thread.update({
      where: { id: thread.id },
      data: { aiSummary: 'Wants a refund for a late order' },
    });

    const ledger = await renderOperatorLedger(org.id, {
      ...EMPTY,
      pendingDigest: {
        threadIds: [thread.id],
        sentAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
      },
    });

    expect(ledger).toContain('support digest');
    expect(ledger).toContain('2h ago');
    expect(ledger).toContain('1. Sarah Jones — Wants a refund for a late order');
    expect(ledger).toContain(`ticket: ${thread.id}`);
    expect(ledger).toContain('<customer_message>');
    expect(ledger).toContain('mark_ticket_spam');
    expect(ledger).toContain('send_ticket_reply');
  });
});

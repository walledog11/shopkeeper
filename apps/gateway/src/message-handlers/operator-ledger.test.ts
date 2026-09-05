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
  pendingPlans: [],
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
      pendingPlans: [{
        threadId: thread.id,
        instruction: 'Refund request for a late order',
        requestDisplay: {
          version: 1,
          kind: 'classified',
          sourceMessageId: 'message-1',
          facts: {
            ask: 'refund',
            subject: 'late order',
            order: null,
            deadline: null,
            deadlineText: null,
            alternative: null,
          },
          noRequest: false,
          topic: null,
        },
        rawToolCalls: [
          { id: 'tc1', name: 'get_shopify_orders', input: { customer_id: '1' } },
          { id: 'tc1b', name: 'search_shopify_products', input: { query: 'shirt' } },
          { id: 'tc1bb', name: 'search_shopify_customers', input: { query: 'jane' } },
          { id: 'tc1c', name: 'get_order_tracking', input: { order_id: '1' } },
          { id: 'tc1d', name: 'get_support_stats', input: {} },
          { id: 'tc2', name: 'create_refund', input: { order_id: '1', amount: 12 } },
          { id: 'tc3', name: 'send_reply', input: { text: 'Refunded $12 for the delay — sorry about that!' } },
        ],
      }],
    });

    expect(ledger).toContain("A drafted plan is awaiting the merchant's decision:");
    expect(ledger).toContain(`Ticket: ${thread.id} (customer: Jane Doe)`);
    expect(ledger).toContain('Jane Doe: refund — late order');
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

  // Same plan, different affordance: the desk resolves it with a button, a phone
  // with a reply, and telling either one to do the other's thing is wrong copy.
  it('names the affordance the merchant actually has on this surface', async () => {
    const customer = await createTestCustomer(org.id, 'surface@example.com', { name: 'Ann Lee' });
    const thread = await createTestThread(org.id, customer.id, 'email');
    const context: OperatorContext = {
      ...EMPTY,
      pendingPlans: [{
        threadId: thread.id,
        instruction: 'Refund request',
        rawToolCalls: [{ id: 'tc1', name: 'send_reply', input: { text: 'On its way.' } }],
      }],
    };

    const desk = await renderOperatorLedger(org.id, context, 'desk');
    expect(desk).toContain('Approve and Dismiss button');
    expect(desk).not.toContain('reply yes to approve');

    const messaging = await renderOperatorLedger(org.id, context, 'messaging');
    expect(messaging).toContain('yes to approve');
    expect(messaging).not.toContain('Approve and Dismiss button');
  });

  it('renders a pending question', async () => {
    const ledger = await renderOperatorLedger(org.id, {
      ...EMPTY,
      pendingQuestion: { threadId: 'ticket_1', question: 'Do we ship to Canada?' },
    });
    expect(ledger).toContain("A question is awaiting the merchant's answer:");
    expect(ledger).toContain('Do we ship to Canada?');
  });

  it('renders a pending digest with indexed tickets and untrusted summaries', async () => {
    const customer = await createTestCustomer(org.id, 'sarah@example.com', { name: 'Sarah Jones' });
    const thread = await createTestThread(org.id, customer.id, 'email');
    await db.thread.update({
      where: { id: thread.id },
      data: { aiSummary: 'Wants a refund for a late order' },
    });

    const ledger = await renderOperatorLedger(org.id, {
      ...EMPTY,
      pendingDigest: {
        items: [{ threadId: thread.id, kind: 'flagged' as const }],
        sentAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
      },
    });

    expect(ledger).toContain('A briefing was sent');
    expect(ledger).toContain('2h ago');
    expect(ledger).toContain('1. Sarah Jones — Wants a refund for a late order');
    expect(ledger).toContain(`ticket: ${thread.id}`);
    expect(ledger).toContain('<customer_message>');
    expect(ledger).toContain('mark_ticket_spam');
    expect(ledger).toContain('send_ticket_reply');
  });

  it('lists every briefing item, not just the flagged ones', async () => {
    const [drafted, escalated] = await Promise.all([
      createTestCustomer(org.id, 'drafted@example.com', { name: 'Drafted Dana' })
        .then((c) => createTestThread(org.id, c.id, 'email')),
      createTestCustomer(org.id, 'escalated@example.com', { name: 'Escalated Eve' })
        .then((c) => createTestThread(org.id, c.id, 'email')),
    ]);

    const ledger = await renderOperatorLedger(org.id, {
      ...EMPTY,
      pendingDigest: {
        items: [
          { threadId: drafted.id, kind: 'approval' as const, planId: 'plan-1' },
          { threadId: escalated.id, kind: 'decision' as const },
        ],
        sentAt: new Date().toISOString(),
      },
    });

    // Both ids have to be here. The briefing is the only surface that prints
    // them, so an item missing from this list is an item the model can only act
    // on by guessing an id.
    expect(ledger).toContain(`ticket: ${drafted.id}`);
    expect(ledger).toContain(`ticket: ${escalated.id}`);
    expect(ledger).toContain('2. Escalated Eve');
    expect(ledger).toContain('a reply is already drafted');
    expect(ledger).toContain('flagged for you, nothing drafted');
  });

  // `items` holds every needs-you thread, not just the ones the message recited,
  // so this section is the one that can grow. The ledger budget cuts from the
  // tail and would shear a ticket id in half, so the bound is on how many items
  // are rendered, not on the length of the string.
  // The phone list cuts summaries at 90 chars because a person is reading one
  // line per ticket. The model is reading the ledger to work out which ticket the
  // merchant means, and the identifying fact is often the second clause — cutting
  // at 90 dropped the privacy question out of "…snowboard from order #1024
  // arrived with a deep scratch on the…" and left the join to luck.
  it('keeps enough of the summary for the model to tell two tickets apart', async () => {
    const customer = await createTestCustomer(org.id, 'long@example.com', { name: 'Dana Okafor' });
    const thread = await createTestThread(org.id, customer.id, 'email');
    const summary = 'The shopper reports that the snowboard from order #1024 arrived with a deep'
      + ' scratch on the base and requests a refund. They also ask what the privacy policy says'
      + ' about their personal data.';
    await db.thread.update({ where: { id: thread.id }, data: { aiSummary: summary } });

    const ledger = await renderOperatorLedger(org.id, {
      ...EMPTY,
      pendingDigest: {
        items: [{ threadId: thread.id, kind: 'decision' as const }],
        sentAt: new Date().toISOString(),
      },
    });

    expect(ledger).toContain('privacy policy');
    expect(ledger).toContain('#1024');
  });

  it('bounds a long briefing by item count and says what it left out', async () => {
    const threads: string[] = [];
    for (let index = 0; index < 14; index += 1) {
      const customer = await createTestCustomer(org.id, `busy${index}@example.com`, { name: `Busy ${index}` });
      const thread = await createTestThread(org.id, customer.id, 'email');
      threads.push(thread.id);
    }

    const ledger = await renderOperatorLedger(org.id, {
      ...EMPTY,
      pendingDigest: {
        items: threads.map((threadId) => ({ threadId, kind: 'decision' as const })),
        sentAt: new Date().toISOString(),
      },
    });

    expect(ledger).toContain('listing 14 tickets');
    expect(ledger).toContain(`ticket: ${threads[11]}`);
    expect(ledger).not.toContain(`ticket: ${threads[12]}`);
    expect(ledger).toContain('2 further items');
    expect(ledger).toContain('list_active_tickets');
    // The whole ledger still has to survive the prompt budget intact.
    expect(ledger.length).toBeLessThan(8_000);
  });

  // The regression that sent a merchant "Agent stopped": a parked plan or an
  // unanswered question used to return early and hide the briefing, which is
  // where ticket ids live. The model then had an instruction naming a ticket and
  // no id anywhere in context, so it passed the order number from the briefing
  // prose as a thread id.
  it('renders every pending kind at once rather than the first', async () => {
    const customer = await createTestCustomer(org.id, 'both@example.com', { name: 'Both Bea' });
    const planThread = await createTestThread(org.id, customer.id, 'email');
    const digestThread = await createTestThread(
      org.id,
      (await createTestCustomer(org.id, 'digest@example.com', { name: 'Digest Dee' })).id,
      'email',
    );

    const ledger = await renderOperatorLedger(org.id, {
      ...EMPTY,
      pendingPlans: [{
        threadId: planThread.id,
        instruction: 'refund it',
        rawToolCalls: [{ id: 'tc_1', name: 'send_reply', input: { text: 'On its way.' } }],
      }],
      pendingPlan: null,
      pendingQuestion: { threadId: 'ticket_1', question: 'Do we ship to Canada?' },
      pendingDigest: {
        items: [{ threadId: digestThread.id, kind: 'decision' as const }],
        sentAt: new Date().toISOString(),
      },
    });

    expect(ledger).toContain("A drafted plan is awaiting the merchant's decision");
    expect(ledger).toContain('Do we ship to Canada?');
    expect(ledger).toContain(`ticket: ${digestThread.id}`);
  });
});

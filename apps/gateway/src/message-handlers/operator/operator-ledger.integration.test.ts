import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@shopkeeper/db';
import {
  createTestOrg,
  createTestCustomer,
  createTestThread,
  cleanupTestData,
} from '@shopkeeper/db/test-helpers';
import { renderOperatorLedger } from './operator-ledger.js';
import type { OperatorContext } from '../../operator-context.js';

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
  it('wraps customer-derived briefing summaries as untrusted data', async () => {
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
        sentAt: new Date().toISOString(),
      },
    });

    const untrusted = ledger.match(/<customer_message>([\s\S]*?)<\/customer_message>/)?.[1];
    expect(untrusted).toContain('Wants a refund for a late order');
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

    expect(ledger).toContain(planThread.id);
    expect(ledger).toContain('Do we ship to Canada?');
    expect(ledger).toContain(`ticket: ${digestThread.id}`);
  });
});

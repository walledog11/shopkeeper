import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@shopkeeper/db';
import {
  cleanupTestData,
  createTestCustomer,
  createTestMessage,
  createTestOrg,
  createTestThread,
} from '@shopkeeper/db/test-helpers';
import { buildAgentPlanCacheRecord } from '@shopkeeper/agent/plan-cache';
import { resolveAgentSettings } from '@shopkeeper/agent/settings';
import type { RequestFacts } from '@shopkeeper/agent/classifier-signals';
import {
  DIGEST_CURSOR_KEY,
  formatApprovalItemLine,
  formatBlockedTicketLine,
  formatEscalatedTicketLine,
  formatHandledSection,
  formatNeedsYouAsk,
  formatNeedsYouProse,
  formatTicketLine,
  loadHandledRollup,
  loadWaitingOnYouItems,
  resolveHandledWindowStart,
} from './digest-briefing.js';
import { appendPendingPlan, updateContext } from '../operator-context.js';

let org!: Awaited<ReturnType<typeof createTestOrg>>;
const NOW = new Date('2026-04-29T12:00:00Z');

// A cached plan that classifies as needing merchant input, so the thread
// qualifies for "Waiting on you" once it goes stale.
function staleReviewPlanCache(lastCustomerMessageId: string) {
  return buildAgentPlanCacheRecord({
    instruction: 'Refund policy question',
    plan: {
      instruction: 'Refund policy question',
      steps: [{
        id: 'step-1',
        tool: 'ask_operator',
        label: 'Ask operator',
        description: 'Ask operator',
        category: 'internal',
        enabled: true,
      }],
      rawToolCalls: [{ id: 'step-1', name: 'ask_operator', input: { question: 'Can we refund?' } }],
    },
    lastCustomerMessageId,
    settings: resolveAgentSettings(null),
  });
}

// A cached plan whose only move is a customer-facing reply, so it classifies as
// `quick_reply` — the shape the stale scan used to drop on the floor.
function staleQuickReplyPlanCache(lastCustomerMessageId: string) {
  return buildAgentPlanCacheRecord({
    instruction: 'Answer the shipping question',
    plan: {
      instruction: 'Answer the shipping question',
      steps: [{
        id: 'step-1',
        tool: 'send_reply',
        label: 'Send reply',
        description: 'Send reply',
        category: 'communication',
        enabled: true,
      }],
      rawToolCalls: [{ id: 'step-1', name: 'send_reply', input: { text: 'We ship worldwide.' } }],
    },
    lastCustomerMessageId,
    settings: resolveAgentSettings(null),
  });
}

beforeEach(async () => {
  org = await createTestOrg();
});

afterEach(async () => {
  await db.operatorContext.deleteMany({ where: { organizationId: org.id } }).catch(() => undefined);
  await cleanupTestData(org?.id);
});

describe('resolveHandledWindowStart', () => {
  it('uses the org digest cursor when present', () => {
    const since = resolveHandledWindowStart({
      [DIGEST_CURSOR_KEY]: '2026-04-28T08:00:00.000Z',
    }, NOW);
    expect(since.toISOString()).toBe('2026-04-28T08:00:00.000Z');
  });

  it('falls back to a 24-hour lookback without a cursor', () => {
    const since = resolveHandledWindowStart({}, NOW);
    expect(since.toISOString()).toBe('2026-04-28T12:00:00.000Z');
  });
});

describe('formatHandledSection', () => {
  it('returns nothing when there is no completed work worth reporting', () => {
    expect(formatHandledSection({
      approvedCount: 0,
      autoCount: 0,
      replyCount: 0,
      refundCount: 0,
      notableLines: [],
    })).toBeNull();
  });

  it('folds a single handled item into one sentence instead of a list of one', () => {
    expect(formatHandledSection({
      approvedCount: 1,
      autoCount: 0,
      replyCount: 1,
      refundCount: 0,
      notableLines: ['Replied to Sarah'],
    })).toBe('Since your last briefing I replied to Sarah.');
  });

  it('keeps the autonomy line on a single folded item', () => {
    expect(formatHandledSection({
      approvedCount: 0,
      autoCount: 1,
      replyCount: 1,
      refundCount: 0,
      notableLines: ['Replied to Sarah'],
    })).toBe('Since your last briefing I replied to Sarah.\n\nThat one ran without needing you.');
  });

  it('summarizes committed work and notable lines', () => {
    const section = formatHandledSection({
      approvedCount: 1,
      autoCount: 1,
      replyCount: 2,
      refundCount: 1,
      notableLines: ['Refunded Sarah $12', 'Replied to Bob'],
    });
    expect(section).toContain('Since your last briefing I handled two things');
    expect(section).toContain('one refund');
    expect(section).toContain('two replies');
    expect(section).toContain('Refunded Sarah $12');
    expect(section).toContain('One of those ran without needing you.');
  });

  it('omits the autonomy line when the merchant approved everything', () => {
    const section = formatHandledSection({
      approvedCount: 2,
      autoCount: 0,
      replyCount: 2,
      refundCount: 0,
      notableLines: [],
    });
    expect(section).toBe('Since your last briefing I handled two things, including two replies.');
  });
});

describe('loadHandledRollup', () => {
  it('rolls up committed plan executions since the cursor', async () => {
    const customer = await createTestCustomer(org.id, 'sarah@example.com', { name: 'Sarah Jones' });
    const thread = await createTestThread(org.id, customer.id, 'email');
    const execution = await db.planExecution.create({
      data: {
        planId: '11111111-1111-4111-8111-111111111111',
        organizationId: org.id,
        threadId: thread.id,
        planHash: 'plan-hash',
        instructionHash: 'instruction-hash',
        status: 'committed',
        mode: 'human_approved',
        completedAt: new Date('2026-04-29T10:00:00Z'),
        claimToken: '22222222-2222-4222-8222-222222222222',
        claimedAt: new Date('2026-04-29T09:59:00Z'),
      },
    });
    await db.agentAction.create({
      data: {
        turnId: '33333333-3333-4333-8333-333333333333',
        organizationId: org.id,
        threadId: thread.id,
        executionId: execution.id,
        tool: 'create_refund',
        category: 'action',
        input: { amount: 12 },
        status: 'success',
        mode: 'human_approved',
        durationMs: 10,
      },
    });

    const rollup = await loadHandledRollup(org.id, new Date('2026-04-29T08:00:00Z'));
    expect(rollup.approvedCount).toBe(1);
    expect(rollup.refundCount).toBe(1);
    expect(rollup.notableLines[0]).toContain('Sarah');
    expect(rollup.notableLines[0]).toContain('$12');
  });
});

describe('formatBlockedTicketLine', () => {
  it('names the person and quotes them, never the classifier title', () => {
    expect(formatBlockedTicketLine({
      customer: { name: 'Walle Walson' },
      aiTitle: 'Unclear One Word Message',
      pendingMessage: 'Test',
    })).toBe('Walle wrote: "Test"');
  });

  // A merchant asked to take a ticket over cannot answer it from the
  // classifier's paraphrase. "Walle: Unclear One Word Message" says the agent
  // gave up; it does not say what the customer wrote, which is the only thing
  // that decides whether this is a real request or a stray "yo".
  it('quotes the customer instead of the classifier title', () => {
    const section = formatBlockedTicketLine(({
      customer: { name: 'Priya Nadar' },
      aiTitle: 'Olive Linen Napkins',
      pendingMessage: 'Do the linen napkins come in a darker olive?',
    }), NOW);
    expect(section).toContain('Priya asked: "Do the linen napkins come in a darker olive?"');
    expect(section).not.toContain('Olive Linen Napkins');
  });

  it('renders a long message from structured fields', () => {
    const section = formatBlockedTicketLine(({
      customer: { name: 'Dana Ruiz' },
      aiTitle: 'Address Change Before Friday',
      pendingMessage: 'Hi! So sorry to be a pain about this, but I have just moved and I gave you the old address by mistake when I checked out last week. Could you send order 1043 to flat 4 instead? And will it still get here before Friday, or should I have it sent to my office?',
      classifierSignals: {
        version: 5,
        language: 'en',
        intents: {},
        requestFacts: { ask: 'address_change', order: '#1043', deadline: '2026-05-01' },
      },
    }), NOW);
    expect(section).toBe('Customer deadline: Fri, May 1, 2026 — Dana · #1043: address change');
    expect(section).not.toContain('…');
  });

  it('quotes a short message whole, never elided', () => {
    const long = `${'a'.repeat(118)}?`;
    const section = formatBlockedTicketLine(({
      customer: { name: 'Ada' },
      pendingMessage: long,
    }));
    expect(section).toContain(`Ada asked: "${long}"`);
    expect(section).not.toContain('…');
  });

  // "wrote" for a statement, "asked" for a question. Guessing "asked" at a
  // complaint would put words in the customer's mouth on the merchant's phone.
  it('says wrote rather than asked when the message is not a question', () => {
    const section = formatBlockedTicketLine(({
      customer: { name: 'Bo Nkemelu' },
      pendingMessage: 'The sweater arrived ripped along the seam.',
    }));
    expect(section).toContain('Bo wrote: "The sweater arrived ripped along the seam."');
  });

  // Real messages ask and then keep talking. Testing only the final character
  // called this one "wrote", which reads as though nobody looked at it.
  it('says asked when the question is not the last sentence', () => {
    const section = formatBlockedTicketLine(({
      customer: { name: 'Priya Nadar' },
      pendingMessage: 'Do these come in a darker olive? The photos look lighter than the swatch.',
    }));
    expect(section).toContain('Priya asked: "Do these come in a darker olive? The photos look lighter than the swatch."');
  });

  it('redacts contact details but keeps an actionable postal address in the quote', () => {
    const section = formatBlockedTicketLine(({
      customer: { name: 'Ada' },
      pendingMessage: 'Reach me at ada@example.com or 14 Alder Road about the mug',
    }));
    expect(section).toContain('their email');
    expect(section).not.toContain('ada@example.com');
    expect(section).toContain('14 Alder Road');
    expect(section).not.toContain('[address redacted]');
  });

  // The only branch left that can elide: too long to quote, and no summary was
  // ever written. It cuts at the summary budget rather than the quote budget so
  // the most possible survives.
  it('falls back to a capped quote when there is no summary', () => {
    const section = formatBlockedTicketLine(({
      customer: { name: 'Ada' },
      pendingMessage: `About my order, ${'the very long story '.repeat(20)}`,
    }));
    expect(section).toContain('About my order');
    expect(section).toContain('…"');
  });

  it('reports unavailable details when neither fields nor source text exist', () => {
    const section = formatBlockedTicketLine(({
      customer: { name: 'Bo' },
      aiTitle: 'Damaged Sweater Return',
    }));
    expect(section).toContain('Request details unavailable');
  });
});

describe('formatTicketLine — fields before prose', () => {
  const factsRow = (requestFacts: Record<string, unknown>) => ({
    aiTitle: 'Napkin Order Question',
    channelType: 'email',
    customer: { name: 'Dana Reyes' },
    classifierSignals: { version: 5, language: 'en', intents: {}, requestFacts },
  });

  // The whole point: a deadline the merchant must act on used to sit past the
  // truncation point of a prose summary. Now it opens the line.
  it('leads with the deadline instead of burying it in a sentence', () => {
    expect(formatTicketLine(
      factsRow({
        ask: 'refund',
        alternative: 'exchange',
        subject: 'the olive linen napkins',
        order: '#1024',
        deadline: '2026-05-01',
        deadlineText: 'before the dinner party',
      }),
      NOW,
    )).toBe('Customer deadline: Fri, May 1, 2026 — Dana · #1024: refund or exchange — the olive linen napkins');
  });

  it('renders without a deadline when the customer named no timing', () => {
    expect(formatTicketLine(
      factsRow({ ask: 'order_status', order: '#1024' }),
      NOW,
    )).toBe('Dana · #1024: order status');
  });

  it('does not revive prose for a thread that predates requestFacts', () => {
    expect(formatTicketLine({
      aiTitle: 'Order Update With No Detail',
      channelType: 'email',
      customer: { name: 'Adam Jones' },
      classifierSignals: { version: 4, language: 'en', intents: {} },
    }, NOW)).toContain('Request details unavailable');
  });

  // The order comes from structured facts; the bounded title is only the topic
  // used when the classifier could not name an ask.
  it('names the topic from aiTitle when the classifier could not read an ask', () => {
    expect(formatTicketLine(
      factsRow({ ask: 'none', order: '#1024' }),
      NOW,
    )).toBe('Dana · #1024 — Napkin Order Question');
  });

  // A stalled conversation and an unreadable ask look identical in the fields —
  // both are `ask: "none"` — and want opposite lines. `no_request` is what
  // separates them, and it is a field, not a reading of the summary.
  it('says nothing was asked when the customer has not asked yet', () => {
    const row = factsRow({ ask: 'none' });
    expect(formatTicketLine(
      { ...row, classifierSignals: { ...row.classifierSignals, intents: { no_request: true } } },
      NOW,
    )).toBe('Dana wrote in — nothing asked yet');
  });

  // Deliberately not "said hello": no_request also covers "yo" and "Test".
  it('does not name a greeting the customer may not have written', () => {
    const row = factsRow({ ask: 'none' });
    const line = formatTicketLine(
      { ...row, classifierSignals: { ...row.classifierSignals, intents: { no_request: true } } },
      NOW,
    );
    expect(line).not.toMatch(/hello/i);
  });
});

describe('handoff and approval lines — fields before prose', () => {
  const FACTS = {
    ask: 'refund',
    alternative: 'exchange',
    subject: 'the olive linen napkins',
    order: '#1024',
    deadline: '2026-05-01',
    deadlineText: 'before the dinner party',
  } satisfies RequestFacts;
  const LINE = 'Customer deadline: Fri, May 1, 2026 — Dana · #1024: refund or exchange — the olive linen napkins';

  const factsRow = (overrides: Record<string, unknown> = {}) => ({
    aiTitle: 'Napkin Order Question',
    channelType: 'email',
    customer: { name: 'Dana Reyes' },
    classifierSignals: { version: 5, language: 'en', intents: {}, requestFacts: FACTS },
    ...overrides,
  });

  it('opens an escalated line with the deadline and keeps the flag clause', () => {
    expect(formatEscalatedTicketLine(factsRow(), NOW)).toBe(`${LINE}. I flagged it for you.`);
  });

  it('marks an older escalation unavailable instead of repairing prose', () => {
    expect(formatEscalatedTicketLine(factsRow({
      classifierSignals: { version: 4, language: 'en', intents: {} },
    }), NOW)).toContain('Request details unavailable');
  });

  // The verbatim branch is the one thing fields must not displace: the
  // customer's own words beat any rendering of them, and it only fires when the
  // whole message fits.
  it('still quotes a short message rather than rendering fields', () => {
    expect(formatBlockedTicketLine(factsRow({
      pendingMessage: 'Can I swap these for the olive ones?',
    }), NOW)).toBe('Dana asked: "Can I swap these for the olive ones?"');
  });

  it('renders fields once the message is too long to quote whole', () => {
    expect(formatBlockedTicketLine(factsRow({
      pendingMessage: 'a'.repeat(200),
    }), NOW)).toBe(LINE);
  });

  it('opens an approval line with the deadline, then what a yes sends', () => {
    expect(formatApprovalItemLine({
      customerName: 'Dana Reyes',
      channelType: 'email',
      aiTitle: 'Napkin Order Question',
      rawToolCalls: [{ id: 't1', name: 'send_reply', input: { text: 'On its way.' } }],
      requestFacts: FACTS,
      now: NOW,
    })).toBe(`${LINE}. Reply's drafted.`);
  });

  it('marks an approval unavailable when the classifier wrote no facts', () => {
    expect(formatApprovalItemLine({
      customerName: 'Dana Reyes',
      channelType: 'email',
      aiTitle: 'Napkin Order Question',
      rawToolCalls: [{ id: 't1', name: 'send_reply', input: { text: 'On its way.' } }],
      now: NOW,
    })).toBe("Request details unavailable — open the thread for the original message. Reply's drafted.");
  });
});

describe('loadWaitingOnYouItems', () => {
  it('dedupes operator pending plans by stable plan id', async () => {
    const customer = await createTestCustomer(org.id, 'sarah@example.com', { name: 'Sarah Jones' });
    const thread = await createTestThread(org.id, customer.id, 'email');
    const pendingPlan = {
      threadId: thread.id,
      instruction: 'Refund the late order',
      planId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      planHash: 'hash-a',
      instructionHash: 'hash-b',
      actionLabel: 'issue refund for Sarah',
      requestDisplay: {
        version: 1 as const,
        kind: 'classified' as const,
        sourceMessageId: 'message-refund',
        facts: {
          ask: 'refund' as const,
          subject: 'damaged order',
          order: null,
          deadline: null,
          deadlineText: null,
          alternative: null,
        },
        noRequest: false,
        topic: null,
      },
      rawToolCalls: [{ id: 'tc1', name: 'create_refund', input: { amount: 12 } }],
    };

    await db.thread.update({
      where: { id: thread.id },
      data: {
        aiSummary: 'Order arrived damaged, wants money back.',
        updatedAt: new Date(NOW.getTime() - 26 * 3_600_000),
      },
    });

    await updateContext(org.id, 'chat-1', { pendingPlan });
    await updateContext(org.id, 'chat-2', { pendingPlan });

    const items = await loadWaitingOnYouItems(org.id, NOW);
    expect(items).toHaveLength(1);
    // Action, then what it's about, then how long it has sat: without the last
    // two, four pending replies to one customer render as four identical lines.
    // Person first, then what a yes does, then what it is about. The action used
    // to lead, which put a tool label in the most scannable position of a line
    // the merchant reads seven of.
    expect(items[0]?.line).toBe("Sarah: refund — damaged order. I've got $12 ready.");

  });

  it('lists several waiting items without numbering them', async () => {
    // Two pending plans for the *same* customer: the case the old copy rendered
    // as two identical "Reply to Canary" bullets.
    for (const [index, summary] of [
      ['a', 'Asking where order 1042 is.'],
      ['b', 'Wants to change the shipping address.'],
    ] as const) {
      const customer = await createTestCustomer(org.id, `canary-${index}@example.com`, { name: 'Canary Reid' });
      const thread = await createTestThread(org.id, customer.id, 'email');
      await db.thread.update({
        where: { id: thread.id },
        data: { aiSummary: summary, updatedAt: new Date(NOW.getTime() - 5 * 3_600_000) },
      });
      await updateContext(org.id, `chat-${index}`, {
        pendingPlan: {
          threadId: thread.id,
          instruction: 'Answer the customer',
          planId: `bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb${index === 'a' ? '1' : '2'}`,
          actionLabel: 'reply to Canary',
          requestDisplay: {
            version: 1,
            kind: 'classified',
            sourceMessageId: `message-${index}`,
            facts: {
              ask: index === 'a' ? 'order_status' : 'address_change',
              subject: null,
              order: index === 'a' ? '#1042' : null,
              deadline: null,
              deadlineText: null,
              alternative: null,
            },
            noRequest: false,
            topic: null,
          },
          rawToolCalls: [{ id: 'tc1', name: 'send_reply', input: { text: 'Hi' } }],
        },
      });
    }

    const items = await loadWaitingOnYouItems(org.id, NOW);
    expect(items).toHaveLength(2);
    const section = formatNeedsYouProse(items.map((entry) => ({
      threadId: entry.threadId, kind: 'approval' as const, line: entry.line,
    })))!;
    expect(section).toContain('Two actions are waiting for your approval.');
    // Every line differs by subject, so the list is worth reading.
    expect(section).toContain("Canary · #1042: order status.\nReply's drafted.");
    expect(section).toContain("Canary: address change.\nReply's drafted.");
    expect(section).not.toContain('shipping address');
    expect(section).not.toMatch(/^\s*\d+\. /m);
    // A bare "yes" here would approve only the most recent plan. The count ties
    // the ask to this list rather than to everything else the briefing names.
    expect(formatNeedsYouAsk(items.map((entry) => ({
      threadId: entry.threadId, kind: 'approval' as const, line: entry.line,
    })))).toBe('Should I go ahead?');
  });

  it('includes stale dashboard plans that still need review', async () => {
    const customer = await createTestCustomer(org.id, 'bob@example.com', { name: 'Bob Lee' });
    const thread = await createTestThread(org.id, customer.id, 'email');
    const message = await createTestMessage(thread.id, 'Can I get a refund?');

    await db.thread.update({
      where: { id: thread.id },
      data: {
        cachedPlan: staleReviewPlanCache(message.id),
        cachedPlanMessageId: message.id,
        updatedAt: new Date(NOW.getTime() - 4 * 3_600_000),
        classifierSignals: {
          version: 5,
          language: 'en',
          intents: {},
          requestFacts: { ask: 'refund' },
        },
      },
    });

    const items = await loadWaitingOnYouItems(org.id, NOW);
    expect(items).toHaveLength(1);
    expect(items[0]?.line).toContain('Bob');
    expect(items[0]?.line).toBe("Bob: refund. Ask the merchant's drafted.");
  });

  it('keeps safe replies out of the merchant queue while preserving real reviews', async () => {
    // The queue holds one plan, so parking the second drops the first from the
    // phone's approval slot. The evicted quick reply belongs to automatic
    // recovery now; the refund review remains merchant work.
    const evicted = await createTestCustomer(org.id, 'first@example.com', { name: 'Ada First' });
    const evictedThread = await createTestThread(org.id, evicted.id, 'email');
    const evictedMessage = await createTestMessage(evictedThread.id, 'Do you ship to Ireland?');

    const kept = await createTestCustomer(org.id, 'second@example.com', { name: 'Bo Second' });
    const keptThread = await createTestThread(org.id, kept.id, 'email');
    const keptMessage = await createTestMessage(keptThread.id, 'Can I get a refund?');

    await db.thread.update({
      where: { id: evictedThread.id },
      data: {
        aiSummary: 'Asking whether we ship to Ireland.',
        cachedPlan: staleQuickReplyPlanCache(evictedMessage.id),
        cachedPlanMessageId: evictedMessage.id,
        updatedAt: new Date(NOW.getTime() - 4 * 3_600_000),
      },
    });
    await db.thread.update({
      where: { id: keptThread.id },
      data: {
        aiSummary: 'Wants a refund on a damaged order.',
        cachedPlan: staleReviewPlanCache(keptMessage.id),
        cachedPlanMessageId: keptMessage.id,
        updatedAt: new Date(NOW.getTime() - 4 * 3_600_000),
      },
    });

    for (const [threadId, planId, actionLabel] of [
      [evictedThread.id, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'reply to Ada'],
      [keptThread.id, 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'ask about the refund'],
    ] as const) {
      await appendPendingPlan(
        org.id,
        'member:1',
        {
          threadId,
          instruction: 'Handle the customer',
          planId,
          actionLabel,
          rawToolCalls: [{ id: 'tc1', name: 'send_reply', input: { text: 'Hi' } }],
        },
        1,
      );
    }

    const items = await loadWaitingOnYouItems(org.id, NOW);
    expect(items.map((item) => item.threadId)).toEqual([keptThread.id]);
    expect(items[0]?.line).not.toContain('Ada');
  });

  it('never names a customer it does not have', async () => {
    const customer = await createTestCustomer(org.id, 'anon@example.com');
    const thread = await createTestThread(org.id, customer.id, 'email');
    await db.thread.update({
      where: { id: thread.id },
      data: { aiTitle: 'Damaged Sweater Return', tag: 'Returns' },
    });
    await updateContext(org.id, 'chat-anon', {
      pendingPlan: {
        threadId: thread.id,
        instruction: 'Answer the customer',
        planId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        requestDisplay: {
          version: 1,
          kind: 'classified',
          sourceMessageId: 'message-anon',
          facts: {
            ask: 'return',
            subject: 'damaged sweater',
            order: null,
            deadline: null,
            deadlineText: null,
            alternative: null,
          },
          noRequest: false,
          topic: null,
        },
        rawToolCalls: [{ id: 'tc1', name: 'send_reply', input: { text: 'Hi' } }],
      },
    });

    const items = await loadWaitingOnYouItems(org.id, NOW);
    // "Customer" is a placeholder, not a name. With nothing to print, the
    // subject falls back to a generic word and the topic carries the line.
    expect(items[0]?.line).not.toContain('Customer');
    expect(items[0]?.line).toBe("Someone: return — damaged sweater. Reply's drafted.");
  });

  it('ignores stale plans on threads outside the support inbox', async () => {
    const customer = await createTestCustomer(org.id, 'op@example.com', { name: 'Operator' });
    for (const channel of ['sms_agent', 'dashboard_agent'] as const) {
      const thread = await createTestThread(org.id, customer.id, channel);
      const message = await createTestMessage(thread.id, 'What needs my attention?');
      await db.thread.update({
        where: { id: thread.id },
        data: {
          cachedPlan: staleReviewPlanCache(message.id),
          cachedPlanMessageId: message.id,
          updatedAt: new Date(NOW.getTime() - 4 * 3_600_000),
        },
      });
    }

    expect(await loadWaitingOnYouItems(org.id, NOW)).toEqual([]);
  });
});

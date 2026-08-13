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
import {
  DIGEST_CURSOR_KEY,
  deriveThreadLifecycleState,
  formatAwaitingCustomerSection,
  formatBlockedSection,
  formatBriefingTicketLine,
  formatHandledSection,
  formatOtherOpenSection,
  formatWaitingItemLine,
  formatWaitingSection,
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

describe('deriveThreadLifecycleState', () => {
  const base = {
    status: 'open',
    planKind: null,
    parkedPlan: false,
    lastConversationalSender: 'customer',
  } as const;

  it('reads a closed thread as handled', () => {
    expect(deriveThreadLifecycleState({ ...base, status: 'closed' })).toBe('handled');
  });

  it('reads a cached plan as awaiting approval', () => {
    expect(deriveThreadLifecycleState({ ...base, planKind: 'needs_review' })).toBe('awaiting_approval');
  });

  it('reads a plan parked on the operator channel as awaiting approval', () => {
    expect(deriveThreadLifecycleState({ ...base, parkedPlan: true })).toBe('awaiting_approval');
  });

  it('reads a thread with no conversational messages as empty', () => {
    expect(deriveThreadLifecycleState({ ...base, lastConversationalSender: null })).toBe('empty_thread');
  });

  it('reads an answered thread as awaiting the customer', () => {
    expect(deriveThreadLifecycleState({ ...base, lastConversationalSender: 'agent' })).toBe('awaiting_customer');
    expect(deriveThreadLifecycleState({ ...base, lastConversationalSender: 'ai' })).toBe('awaiting_customer');
  });

  it('reads a pending customer message with no plan as blocked', () => {
    expect(deriveThreadLifecycleState(base)).toBe('blocked_no_plan');
  });

  // Both Order Status threads in the diagnosed org hold two note rows from the
  // Shopify order webhook and nothing else. Counting a note as the agent having
  // answered would file them as awaiting_customer and let P4's silence sweep
  // close threads that were never actually worked.
  it('never treats a note row as the agent answering', () => {
    // The caller passes the newest *non-note* message, so a note-only thread
    // arrives here as null rather than as a note sender.
    expect(deriveThreadLifecycleState({ ...base, lastConversationalSender: null })).not.toBe('awaiting_customer');
  });

  // A quick_reply is the shape the operator queue evicts and the stale scan used
  // to refuse to re-surface. It is waiting on the merchant like any other.
  it('collapses every plan kind to awaiting approval', () => {
    for (const kind of ['quick_reply', 'needs_review', 'needs_merchant_input', 'auto_execute'] as const) {
      expect(deriveThreadLifecycleState({ ...base, planKind: kind })).toBe('awaiting_approval');
    }
  });
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
  it('returns a quiet line when nothing was handled', () => {
    expect(formatHandledSection({
      approvedCount: 0,
      autoCount: 0,
      replyCount: 0,
      refundCount: 0,
      notableLines: [],
    })).toBe('Since your last briefing I didn\'t send any replies or refunds.');
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

describe('formatBlockedSection', () => {
  it('hands one thread back in the agent\'s own voice', () => {
    const section = formatBlockedSection([{
      customer: { name: 'Walle Walson' },
      aiTitle: 'Unclear One Word Message',
      aiSummary: null,
      tag: null,
      pendingMessage: 'Test',
    }]);
    expect(section).toContain("One I couldn't work out a next step on, so it's yours:");
    expect(section).toContain('Walle');
  });

  // A merchant asked to take a ticket over cannot answer it from the
  // classifier's paraphrase. "Walle: Unclear One Word Message" says the agent
  // gave up; it does not say what the customer wrote, which is the only thing
  // that decides whether this is a real request or a stray "yo".
  it('quotes the customer instead of the classifier title', () => {
    const section = formatBlockedSection([{
      customer: { name: 'Priya Nadar' },
      aiTitle: 'Olive Linen Napkins',
      aiSummary: 'Customer asks whether the linen napkins come in a darker olive shade.',
      tag: 'Product Inquiry',
      pendingMessage: 'Do the linen napkins come in a darker olive?',
    }]);
    expect(section).toContain('Priya asked: "Do the linen napkins come in a darker olive?"');
    expect(section).not.toContain('Olive Linen Napkins');
  });

  // A cut-off quote is the same dead end as the title, from the other side: the
  // merchant learns a sentence existed. Past the verbatim width the line carries
  // the summary, which is a whole statement of the request rather than a
  // fragment of one, so nothing has to be asked for a second time.
  it('summarizes a long message rather than cutting it off', () => {
    const section = formatBlockedSection([{
      customer: { name: 'Dana Ruiz' },
      aiTitle: 'Address Change Before Friday',
      aiSummary: 'Customer asks to move order #1043 to a new flat and whether it will still arrive before Friday.',
      tag: 'Shipping',
      pendingMessage: 'Hi! So sorry to be a pain about this, but I have just moved and I gave you the old address by mistake when I checked out last week. Could you send order 1043 to flat 4 instead? And will it still get here before Friday, or should I have it sent to my office?',
    }])!;
    // The person is the subject of the sentence, past tense, and the classifier's
    // "Customer" noun is gone — it only repeated the name the line already has.
    expect(section).toContain('- Dana asked to move order #1043 to a new flat and whether it will still arrive before Friday.');
    expect(section).not.toContain('Customer asks');
    expect(section).not.toContain('…');
  });

  it('quotes a short message whole, never elided', () => {
    const long = `${'a'.repeat(118)}?`;
    const section = formatBlockedSection([{
      customer: { name: 'Ada' },
      aiSummary: 'Customer says something at length.',
      tag: null,
      pendingMessage: long,
    }])!;
    expect(section).toContain(`Ada asked: "${long}"`);
    expect(section).not.toContain('…');
  });

  // "wrote" for a statement, "asked" for a question. Guessing "asked" at a
  // complaint would put words in the customer's mouth on the merchant's phone.
  it('says wrote rather than asked when the message is not a question', () => {
    const section = formatBlockedSection([{
      customer: { name: 'Bo Nkemelu' },
      aiSummary: null,
      tag: null,
      pendingMessage: 'The sweater arrived ripped along the seam.',
    }])!;
    expect(section).toContain('Bo wrote: "The sweater arrived ripped along the seam."');
  });

  // Real messages ask and then keep talking. Testing only the final character
  // called this one "wrote", which reads as though nobody looked at it.
  it('says asked when the question is not the last sentence', () => {
    const section = formatBlockedSection([{
      customer: { name: 'Priya Nadar' },
      aiSummary: null,
      tag: null,
      pendingMessage: 'Do these come in a darker olive? The photos look lighter than the swatch.',
    }])!;
    expect(section).toContain('Priya asked: "Do these come in a darker olive? The photos look lighter than the swatch."');
  });

  it('redacts contact details out of the quote', () => {
    const section = formatBlockedSection([{
      customer: { name: 'Ada' },
      aiSummary: null,
      tag: null,
      pendingMessage: 'Reach me at ada@example.com about the mug',
    }])!;
    expect(section).toContain('their email');
    expect(section).not.toContain('ada@example.com');
  });

  // The only branch left that can elide: too long to quote, and no summary was
  // ever written. It cuts at the summary budget rather than the quote budget so
  // the most possible survives.
  it('falls back to a capped quote when there is no summary', () => {
    const section = formatBlockedSection([{
      customer: { name: 'Ada' },
      aiSummary: null,
      tag: null,
      pendingMessage: `About my order, ${'the very long story '.repeat(20)}`,
    }])!;
    expect(section).toContain('About my order');
    expect(section).toContain('…"');
  });

  // Older threads and any path that does not load message text still render.
  it('falls back to the classifier line with no message to quote', () => {
    const section = formatBlockedSection([{
      customer: { name: 'Bo' },
      aiTitle: 'Damaged Sweater Return',
      aiSummary: null,
      tag: null,
    }]);
    expect(section).toContain('Bo: Damaged Sweater Return');
  });

  it('counts and pluralizes without asking for a decision it cannot act on', () => {
    const section = formatBlockedSection([
      { customer: { name: 'Ada' }, aiSummary: 'One', tag: null },
      { customer: { name: 'Bo' }, aiSummary: 'Two', tag: null },
    ]);
    expect(section).toContain("Two I couldn't work out a next step on, so they're yours:");
    expect(section).not.toContain('?');
  });

  it('renders nothing when no thread is blocked', () => {
    expect(formatBlockedSection([])).toBeNull();
  });
});

describe('formatAwaitingCustomerSection', () => {
  // Reported, never asked: the merchant has no decision to make on a thread the
  // agent already answered, so this section must not end in a question.
  it('reports an answered thread without asking anything', () => {
    const section = formatAwaitingCustomerSection([{
      customer: { name: null },
      channelType: 'shopify_chat',
      aiTitle: 'Unclear One Word Message',
      aiSummary: null,
      tag: null,
    }]);
    expect(section).toContain("I answered this one and haven't heard back:");
    expect(section).not.toContain('?');
  });

  it('counts several answered threads', () => {
    const section = formatAwaitingCustomerSection([
      { customer: { name: 'Ada' }, aiSummary: 'One', tag: null },
      { customer: { name: 'Bo' }, aiSummary: 'Two', tag: null },
    ]);
    expect(section).toContain("I answered two of these and haven't heard back:");
  });

  it('renders nothing when nothing is waiting on a customer', () => {
    expect(formatAwaitingCustomerSection([])).toBeNull();
  });
});

describe('formatOtherOpenSection', () => {
  it('summarizes hidden open tickets with order-first labels', () => {
    const section = formatOtherOpenSection([
      {
        customer: { name: 'Bob Lee' },
        aiTitle: 'Cancelled Order',
        aiSummary: 'Customer reports that order #1043 was cancelled',
        tag: 'Order Status',
      },
      {
        customer: { name: 'Jane Doe' },
        aiSummary: 'Asking about shipping times',
        tag: null,
      },
    ]);
    expect(section).toContain('Also open:');
    expect(section).toContain('Bob · #1043: Cancelled Order');
    expect(section).toContain('Jane: Asking about shipping times');
  });

  it('caps the roll-up and shows a more line', () => {
    const section = formatOtherOpenSection([
      { customer: { name: 'A' }, aiSummary: 'One', tag: null },
      { customer: { name: 'B' }, aiSummary: 'Two', tag: null },
      { customer: { name: 'C' }, aiSummary: 'Three', tag: null },
      { customer: { name: 'D' }, aiSummary: 'Four', tag: null },
    ]);
    expect(section).toContain('…and two more');
    expect(section).not.toContain('- D:');
  });
});

describe('formatBriefingTicketLine', () => {
  // The classifier writes `aiTitle` as a short subject line naming the topic.
  // That is the briefing's unit; `aiSummary` is the dashboard's full sentence.
  it('prefers the classifier title over the dashboard summary', () => {
    expect(formatBriefingTicketLine(
      'Adam Jones',
      'Order Update With No Detail',
      'Customer states that order #1025 has been updated, but provides no details about what changed or when it ships',
      null,
    )).toBe('Adam · #1025: Order Update With No Detail');
  });

  it('leaves the order number in the topic rather than cutting it out', () => {
    expect(formatBriefingTicketLine(
      'Bob Lee',
      'Where Is Order #1043',
      null,
      null,
    )).toBe('Bob: Where Is Order #1043');
  });

  it('falls back to the summary when a thread predates the title field', () => {
    expect(formatBriefingTicketLine(
      'Walle',
      null,
      'Customer is asking for a shipping update and mentions an upcoming trip',
      null,
    )).toBe('Walle: Shipping update and mentions an upcoming trip');

    expect(formatBriefingTicketLine(
      null,
      null,
      'Customer wrote a single word: "Testing."',
      null,
    )).toBe('Someone: Testing');
  });

  it('names the channel when storefront chat gives it no name to use', () => {
    expect(formatBriefingTicketLine(
      null,
      'Order Status Without Order Number',
      null,
      null,
      'shopify_chat',
    )).toBe('Storefront visitor: Order Status Without Order Number');
  });

  it('maps classifier tags to plain language', () => {
    expect(formatBriefingTicketLine('Ayumu', null, null, 'Order Status'))
      .toBe("Ayumu: Where's my order?");
  });
});

describe('formatWaitingItemLine', () => {
  it('uses the classifier title instead of truncating the summary', () => {
    const line = formatWaitingItemLine({
      customerName: 'Adam Jones',
      aiTitle: 'Order Update With No Detail',
      aiSummary: 'Customer states that order #1025 has been updated, but provides no details about what changed',
      tag: null,
      rawToolCalls: [{ id: 'tc1', name: 'send_reply', input: { text: 'Hi' } }],
      instruction: 'Answer the customer',
      actionLabel: 'reply to Adam',
      now: NOW,
      since: new Date(NOW.getTime() - 26 * 3_600_000),
    });
    // Named customer plus a leading action, so the order number gives up its
    // segment: three of them before the topic is punctuation, not information.
    expect(line).toBe('Reply · Adam: Order Update With No Detail (waiting 1 day)');
    expect(line).not.toContain('provides no details');
  });

  // What a one-word approval actually does. Before this the line named the
  // ticket and nothing else, so "Want me to go ahead with it?" could only be
  // answered by opening the dashboard.
  it('leads with the action being approved', () => {
    const line = formatWaitingItemLine({
      customerName: null,
      channelType: 'shopify_chat',
      aiTitle: 'Order Status Inquiry',
      aiSummary: 'Visitor asks for the status of their order',
      tag: null,
      rawToolCalls: [
        { id: 'tc1', name: 'get_order', input: { orderNumber: '1042' } },
        { id: 'tc2', name: 'send_reply', input: { text: 'Hi' } },
      ],
      instruction: 'Answer the visitor',
      actionLabel: 'run those 2 steps',
      now: NOW,
      since: new Date(NOW.getTime() - 48 * 3_600_000),
    });
    // Lookups are not what the merchant is approving, so the read step does not
    // count toward the step tally.
    expect(line).toBe('Reply · Storefront visitor: Order Status Inquiry (waiting 2 days)');
  });

  it('counts the extra steps a single approval would run', () => {
    const line = formatWaitingItemLine({
      customerName: 'Dana Ruiz',
      aiTitle: 'Wrong Size Shipped',
      aiSummary: 'Customer received the wrong size',
      tag: null,
      rawToolCalls: [
        { id: 'tc1', name: 'create_return', input: {} },
        { id: 'tc2', name: 'send_reply', input: { text: 'Hi' } },
      ],
      instruction: 'Sort out the return',
      now: NOW,
      since: new Date(NOW.getTime() - 2 * 3_600_000),
    });
    expect(line).toBe('Open return + one more · Dana: Wrong Size Shipped (waiting 2 hours)');
  });

  // The old line read "Escalate to merchant: about tracking numbers and
  // shipping addresses for four different orders (,…" — a tool label in the
  // most scannable position, and punctuation stranded by lifting out an order
  // number the line then truncated anyway. The action leads now, but the
  // subject slot after it is still a person or an order, never the tool.
  it('never spends the subject slot on a tool label', () => {
    const line = formatWaitingItemLine({
      customerName: null,
      channelType: 'email',
      aiTitle: 'Tracking And Address Changes',
      aiSummary: 'Customer is asking about tracking numbers and shipping addresses for four different orders (#1019, #1020, #1021, #1022)',
      tag: null,
      rawToolCalls: [{ id: 'tc1', name: 'escalate_to_human', input: { reason: 'four orders' } }],
      instruction: 'Ask the merchant',
      now: NOW,
      since: new Date(NOW.getTime() - 11 * 3_600_000),
    });
    // With no name to print, the order number is a better subject than
    // "Someone" — so it keeps its slot even with the action ahead of it.
    expect(line).toBe('Escalate to merchant · #1019: Tracking And Address Changes (waiting 11 hours)');
    expect(line.split(' · ')[1]).toBe('#1019: Tracking And Address Changes (waiting 11 hours)');
  });

  it('never leaves stranded punctuation or a live address in the line', () => {
    const line = formatWaitingItemLine({
      customerName: null,
      aiTitle: null,
      aiSummary: 'Customer provided an email address (adoaiere983403984@yahoo.com) in response to a request for order details',
      tag: null,
      rawToolCalls: [{ id: 'tc1', name: 'send_reply', input: { text: 'Hi' } }],
      instruction: 'Answer the customer',
      now: NOW,
      since: new Date(NOW.getTime() - 9 * 3_600_000),
    });
    expect(line).not.toContain('@');
    expect(line).not.toMatch(/[(,;:\s]…/);
    expect(line).toContain('their email');
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
    expect(items[0]?.line).toBe(
      '$12 refund · Sarah: Order arrived damaged, wants money back (waiting 1 day)',
    );
    // The "still waiting on your OK" framing belongs to the header, and the ask
    // names it back rather than saying "it" — the ask lands under whatever
    // blocked, answered and flagged sections the briefing also has, so a bare
    // pronoun asks about all of them.
    expect(formatWaitingSection(items)).toBe(
      "One thing's still waiting on your OK:\n"
      + '- $12 refund · Sarah: Order arrived damaged, wants money back (waiting 1 day)\n'
      + '\n'
      + 'Want me to go ahead with the one waiting on your OK?',
    );
  });

  it('numbers several waiting items and never invites a bare yes across them', async () => {
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
          rawToolCalls: [{ id: 'tc1', name: 'send_reply', input: { text: 'Hi' } }],
        },
      });
    }

    const items = await loadWaitingOnYouItems(org.id, NOW);
    expect(items).toHaveLength(2);
    const section = formatWaitingSection(items)!;
    expect(section).toContain('Two things are still waiting on your OK:');
    // Every line differs by subject, so the list is worth reading.
    expect(section).toContain('1. Reply · Canary: Asking where order 1042 is (waiting 5 hours)');
    expect(section).toContain('2. Reply · Canary: Wants to change the shipping address (waiting 5 hours)');
    // Wrapped items run together without air between them.
    expect(section).toContain('(waiting 5 hours)\n\n2.');
    // A bare "yes" here would approve only the most recent plan. The count ties
    // the ask to this list rather than to everything else the briefing names.
    expect(section.trimEnd().endsWith('Tell me which of the two waiting on your OK to go ahead with.')).toBe(true);
    expect(section).not.toMatch(/Want me to send (any of )?those\?/);
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
      },
    });

    const items = await loadWaitingOnYouItems(org.id, NOW);
    expect(items).toHaveLength(1);
    expect(items[0]?.line).toContain('Bob');
    expect(formatWaitingSection(items)).toContain("still waiting on your OK");
  });

  it('re-surfaces a quick reply the operator queue evicted', async () => {
    // The queue holds one plan, so parking the second drops the first from the
    // phone's approval slot. The evicted plan is a quick_reply — the drafted
    // reply is still sitting in cachedPlan, unsent, and the stale scan is the
    // only thing that can mention it again.
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
    expect(items.map((item) => item.threadId)).toEqual([keptThread.id, evictedThread.id]);
    expect(items[1]?.line).toContain('Ada');
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
        rawToolCalls: [{ id: 'tc1', name: 'send_reply', input: { text: 'Hi' } }],
      },
    });

    const items = await loadWaitingOnYouItems(org.id, NOW);
    // "Customer" is a placeholder, not a name. With nothing to print, the
    // subject falls back to a generic word and the topic carries the line.
    expect(items[0]?.line).not.toContain('Customer');
    expect(items[0]?.line).toBe('Reply · Someone: Damaged Sweater Return');
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

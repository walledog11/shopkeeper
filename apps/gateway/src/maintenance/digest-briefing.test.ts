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
  formatApprovalItemLine,
  formatBlockedTicketLine,
  formatBriefingTicketLine,
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
      aiSummary: null,
      tag: null,
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
      aiSummary: 'Customer asks whether the linen napkins come in a darker olive shade.',
      tag: 'Product Inquiry',
      pendingMessage: 'Do the linen napkins come in a darker olive?',
    }));
    expect(section).toContain('Priya asked: "Do the linen napkins come in a darker olive?"');
    expect(section).not.toContain('Olive Linen Napkins');
  });

  // A cut-off quote is the same dead end as the title, from the other side: the
  // merchant learns a sentence existed. Past the verbatim width the line carries
  // the summary, which is a whole statement of the request rather than a
  // fragment of one, so nothing has to be asked for a second time.
  it('summarizes a long message rather than cutting it off', () => {
    const section = formatBlockedTicketLine(({
      customer: { name: 'Dana Ruiz' },
      aiTitle: 'Address Change Before Friday',
      aiSummary: 'Customer asks to move order #1043 to a new flat and whether it will still arrive before Friday.',
      tag: 'Shipping',
      pendingMessage: 'Hi! So sorry to be a pain about this, but I have just moved and I gave you the old address by mistake when I checked out last week. Could you send order 1043 to flat 4 instead? And will it still get here before Friday, or should I have it sent to my office?',
    }));
    // The person is the subject of the sentence, past tense, and the classifier's
    // "Customer" noun is gone — it only repeated the name the line already has.
    expect(section).toContain('Dana asked to move order #1043 to a new flat and whether it will still arrive before Friday.');
    expect(section).not.toContain('Customer asks');
    expect(section).not.toContain('…');
  });

  it('quotes a short message whole, never elided', () => {
    const long = `${'a'.repeat(118)}?`;
    const section = formatBlockedTicketLine(({
      customer: { name: 'Ada' },
      aiSummary: 'Customer says something at length.',
      tag: null,
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
      aiSummary: null,
      tag: null,
      pendingMessage: 'The sweater arrived ripped along the seam.',
    }));
    expect(section).toContain('Bo wrote: "The sweater arrived ripped along the seam."');
  });

  // Real messages ask and then keep talking. Testing only the final character
  // called this one "wrote", which reads as though nobody looked at it.
  it('says asked when the question is not the last sentence', () => {
    const section = formatBlockedTicketLine(({
      customer: { name: 'Priya Nadar' },
      aiSummary: null,
      tag: null,
      pendingMessage: 'Do these come in a darker olive? The photos look lighter than the swatch.',
    }));
    expect(section).toContain('Priya asked: "Do these come in a darker olive? The photos look lighter than the swatch."');
  });

  it('redacts contact details out of the quote', () => {
    const section = formatBlockedTicketLine(({
      customer: { name: 'Ada' },
      aiSummary: null,
      tag: null,
      pendingMessage: 'Reach me at ada@example.com about the mug',
    }));
    expect(section).toContain('their email');
    expect(section).not.toContain('ada@example.com');
  });

  // The only branch left that can elide: too long to quote, and no summary was
  // ever written. It cuts at the summary budget rather than the quote budget so
  // the most possible survives.
  it('falls back to a capped quote when there is no summary', () => {
    const section = formatBlockedTicketLine(({
      customer: { name: 'Ada' },
      aiSummary: null,
      tag: null,
      pendingMessage: `About my order, ${'the very long story '.repeat(20)}`,
    }));
    expect(section).toContain('About my order');
    expect(section).toContain('…"');
  });

  // Older threads and any path that does not load message text still render.
  it('falls back to the classifier line with no message to quote', () => {
    const section = formatBlockedTicketLine(({
      customer: { name: 'Bo' },
      aiTitle: 'Damaged Sweater Return',
      aiSummary: null,
      tag: null,
    }));
    expect(section).toContain('Bo: Damaged Sweater Return');
  });
});

describe('formatTicketLine — fields before prose', () => {
  const factsRow = (requestFacts: Record<string, unknown>) => ({
    aiTitle: 'Napkin Order Question',
    aiSummary: 'Customer requests a refund and mentions an upcoming dinner party.',
    tag: 'Returns',
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
    )).toBe('By Friday — Dana · #1024: refund or exchange — the olive linen napkins');
  });

  it('renders without a deadline when the customer named no timing', () => {
    expect(formatTicketLine(
      factsRow({ ask: 'order_status', order: '#1024' }),
      NOW,
    )).toBe('Dana · #1024: order status');
  });

  // Every thread classified before version 5 has no facts, and must read exactly
  // as it did before this path existed.
  it('falls back to the prose path when the thread predates requestFacts', () => {
    expect(formatTicketLine({
      aiTitle: 'Order Update With No Detail',
      aiSummary: 'Customer states that order #1025 has been updated.',
      tag: null,
      channelType: 'email',
      customer: { name: 'Adam Jones' },
      classifierSignals: { version: 4, language: 'en', intents: {} },
    }, NOW)).toBe('Adam · #1025: Order Update With No Detail');
  });

  // The prose path derives its order ref from the title and summary, so an order
  // known only to requestFacts does not reach it. That is the fallback behaving
  // exactly as it did before this path existed, which is the point.
  it('falls back when the classifier could not read an ask', () => {
    expect(formatTicketLine(
      factsRow({ ask: 'none', order: '#1024' }),
      NOW,
    )).toBe('Dana: Napkin Order Question');
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
  };
  const LINE = 'By Friday — Dana · #1024: refund or exchange — the olive linen napkins';

  const factsRow = (overrides: Record<string, unknown> = {}) => ({
    aiTitle: 'Napkin Order Question',
    aiSummary: 'Customer requests a refund and mentions an upcoming dinner party.',
    tag: 'Returns',
    channelType: 'email',
    customer: { name: 'Dana Reyes' },
    classifierSignals: { version: 5, language: 'en', intents: {}, requestFacts: FACTS },
    ...overrides,
  });

  it('opens an escalated line with the deadline and keeps the flag clause', () => {
    expect(formatEscalatedTicketLine(factsRow(), NOW)).toBe(`${LINE}. I flagged it for you.`);
  });

  it('leaves an escalated line on prose when the thread predates the fields', () => {
    expect(formatEscalatedTicketLine(factsRow({
      classifierSignals: { version: 4, language: 'en', intents: {} },
    }), NOW)).toContain('I flagged it for you.');
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
      aiSummary: 'Customer requests a refund and mentions an upcoming dinner party.',
      tag: 'Returns',
      rawToolCalls: [{ id: 't1', name: 'send_reply', input: { text: 'On its way.' } }],
      instruction: 'Refund request',
      requestFacts: FACTS,
      now: NOW,
    })).toBe(`${LINE}. Reply's drafted.`);
  });

  it('leaves the approval line on prose when the classifier wrote no facts', () => {
    expect(formatApprovalItemLine({
      customerName: 'Dana Reyes',
      channelType: 'email',
      aiTitle: 'Napkin Order Question',
      aiSummary: 'Customer requests a refund.',
      tag: 'Returns',
      rawToolCalls: [{ id: 't1', name: 'send_reply', input: { text: 'On its way.' } }],
      instruction: 'Refund request',
      now: NOW,
    })).toContain("Reply's drafted.");
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

  // Verification is the merchant's evidence that this person owns the order, so
  // the line that reports it must not also call them unidentified. The operator
  // card for the same thread says "They confirmed the email on #1024".
  it('calls a verified shopper the customer on their order, not a visitor', () => {
    expect(formatBriefingTicketLine(
      null,
      'Damaged Snowboard Refund',
      null,
      null,
      'shopify_chat',
      ['#1024'],
    )).toBe('The customer on #1024: Damaged Snowboard Refund');
  });

  // Only while nobody has identified them.
  it('still names the channel for an unverified storefront visitor', () => {
    expect(formatBriefingTicketLine(
      null,
      'Damaged Snowboard Refund',
      null,
      null,
      'shopify_chat',
      [],
    )).toBe('Storefront visitor: Damaged Snowboard Refund');
  });
});

describe('formatEscalatedTicketLine', () => {
  // The line the 2026-08-21 briefing got wrong, in one case. `aiSummary` is the
  // episode summary — every ask made across the conversation — so a merchant read
  // one escalation as a refund request *and* a shipping question *and* a pricing
  // question *and* a privacy question, above a plan that only addressed the
  // refund. `requestSummary` is the ask that is actually outstanding.
  it('reports the outstanding request, not the whole conversation', () => {
    const line = formatEscalatedTicketLine({
      customer: { name: null },
      channelType: 'shopify_chat',
      aiTitle: null,
      aiSummary:
        'Customer reports that the snowboard from order #1024 arrived with a deep scratch on the base '
        + 'and requests a refund. They also ask whether order #1024 has shipped and to confirm the '
        + "delivery address, and asks about the shop's privacy policy.",
      requestSummary: 'Customer requests a refund for the scratched snowboard on order #1024.',
      tag: 'Refund',
      verifiedOrders: ['#1024'],
    });
    expect(line).toBe(
      'The customer requested a refund for the scratched snowboard on order #1024. I flagged it for you.',
    );
    expect(line).not.toContain('privacy policy');
    expect(line).not.toContain('delivery address');
    expect(line).not.toContain('Storefront visitor');
  });

  // The order earns a place in the subject only when the sentence after it does
  // not already name it — otherwise the line says #1024 twice.
  it('names the verified order in the subject when the summary does not', () => {
    expect(formatEscalatedTicketLine({
      customer: { name: null },
      channelType: 'shopify_chat',
      aiTitle: null,
      aiSummary: null,
      requestSummary: 'Customer wants to change the delivery address before it ships.',
      tag: 'Shipping',
      verifiedOrders: ['#1024'],
    })).toBe(
      'The customer on #1024 wanted to change the delivery address before it ships. I flagged it for you.',
    );
  });

  // Proactive plans (delivery exception, return arrival) have no inbound message
  // to summarise and leave requestSummary null by construction.
  it('falls back to the episode summary when no request was summarised', () => {
    expect(formatEscalatedTicketLine({
      customer: { name: 'Dana Ruiz' },
      channelType: 'email',
      aiTitle: null,
      aiSummary: 'Customer asks to move order #1043 to a new flat.',
      requestSummary: null,
      tag: 'Shipping',
    })).toBe('Dana asked to move order #1043 to a new flat. I flagged it for you.');
  });

  // "request" takes a bare object and "ask" takes one only with `for`, so
  // backshifting one verb into the other dropped the preposition and the
  // briefing said "asked a refund".
  it('backshifts requests to requested rather than to asked', () => {
    expect(formatEscalatedTicketLine({
      customer: { name: 'Bo Nkemelu' },
      channelType: 'email',
      aiTitle: null,
      aiSummary: null,
      requestSummary: 'Customer requests a refund for the torn sweater.',
      tag: 'Refund',
    })).toBe('Bo requested a refund for the torn sweater. I flagged it for you.');
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
    // Person first, then what a yes does, then what it is about. The action used
    // to lead, which put a tool label in the most scannable position of a line
    // the merchant reads seven of.
    expect(items[0]?.line).toBe('Sarah — $12 refund · Order arrived damaged, wants money back');

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
    expect(section).toContain('Canary — reply · Asking where order 1042 is');
    expect(section).toContain('Canary — reply · Wants to change the shipping address');
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
      },
    });

    const items = await loadWaitingOnYouItems(org.id, NOW);
    expect(items).toHaveLength(1);
    expect(items[0]?.line).toContain('Bob');
    expect(items[0]?.line).toBe('Bob — ask the merchant · Support');
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
        rawToolCalls: [{ id: 'tc1', name: 'send_reply', input: { text: 'Hi' } }],
      },
    });

    const items = await loadWaitingOnYouItems(org.id, NOW);
    // "Customer" is a placeholder, not a name. With nothing to print, the
    // subject falls back to a generic word and the topic carries the line.
    expect(items[0]?.line).not.toContain('Customer');
    expect(items[0]?.line).toBe('Someone — reply · Damaged Sweater Return');
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

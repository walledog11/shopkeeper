import { randomUUID } from 'node:crypto';
import type { AgentContext } from '@shopkeeper/agent/context';
import { loadGatewayEnv } from '../config/load-env.js';

// Live-model probe for the 2026-09-04 regression: the merchant answers the morning
// briefing with "send the customer a concise version of the privacy policy" and the
// turn has to reach the escalated ticket that briefing named.
//
// It reconstructs the exact state that failed — a pendingQuestion about a DIFFERENT
// customer (which used to hide the briefing from the ledger entirely) plus a digest
// whose items are an approval and an escalation, so the retired `threadIds` field
// would have been empty and every triage call would have been refused. The one join
// the model has to make is the real one: the briefing prose links order #1024 to the
// privacy question, and only the ledger line for that ticket mentions #1024.
//
// The send tool is a recording stub, so this never reaches a customer.
//
//   npx tsx apps/gateway/src/scripts/verify-briefing-reply.ts
loadGatewayEnv();

const BRIEFING = `Morning, Shopkeeper here.

One action is waiting for your approval.

Sarah: product question — candle.
Reply's drafted.

One needs your decision.

The customer on #1024 asked: "Also, before I forget - can you tell me what your privacy policy says about how you handle my personal data?" I flagged it for you.`;

async function main() {
  const { db } = await import('@shopkeeper/db');
  const { runAgent } = await import('@shopkeeper/agent/run');
  const { defineTool, stringArg, toolOk } = await import('@shopkeeper/agent/tools');
  const { renderOperatorLedger } = await import('../message-handlers/operator-ledger.js');
  const { buildOperatorInboxTools } = await import('../message-handlers/operator-inbox-tools.js');

  const marker = randomUUID();
  const org = await db.organization.create({
    data: { clerkOrgId: `org_briefing_reply_${marker}`, name: 'Briefing Reply Verification' },
    select: { id: true, name: true },
  });

  try {
    const operatorCustomer = await db.customer.create({
      data: { organizationId: org.id, platformId: `operator-${marker}@example.com`, name: 'Operator' },
      select: { id: true },
    });
    const operatorThread = await db.thread.create({
      data: {
        organizationId: org.id,
        customerId: operatorCustomer.id,
        channelType: 'sms_agent',
        status: 'open',
      },
      select: { id: true },
    });

    // The store's privacy article, as the production org has it. Without it the
    // model correctly refuses to invent a policy, which is right behaviour but
    // tests nothing about ticket selection.
    const knowledgeBase = await db.knowledgeBase.create({
      data: { organizationId: org.id, name: 'Store policies', source: 'shopify' },
      select: { id: true },
    });
    await db.kbArticle.create({
      data: {
        organizationId: org.id,
        knowledgeBaseId: knowledgeBase.id,
        title: 'Your Privacy Choices',
        body: 'As described in our Privacy Policy, we collect personal information from your'
          + ' interactions with us and our website, including through cookies and similar'
          + ' technologies. We may also share this personal information with third parties,'
          + ' including advertising partners, to show you more relevant ads. Sharing personal'
          + ' information for targeted advertising may be considered a "sale" or "share" under'
          + ' certain state privacy laws, and you have the right to opt out, including through'
          + ' Global Privacy Control signals.',
      },
    });

    // Ticket 1 is the drafted approval; ticket 2 is the escalation the briefing
    // quoted. Neither is `flagged`, which is precisely the shape that produced an
    // empty `threadIds` in production.
    const tickets: string[] = [];
    for (const fixture of [
      {
        name: 'Sarah Whitcombe',
        summary: 'Sarah thanks the shop for her candle order and asks for advice on how to make it burn evenly.',
        escalated: false,
      },
      {
        name: 'Dana Okafor',
        summary: 'The shopper reports that the snowboard from order #1024 arrived scratched and requests a refund. They also ask what the privacy policy says about their personal data.',
        escalated: true,
      },
    ]) {
      const customer = await db.customer.create({
        data: {
          organizationId: org.id,
          platformId: `${fixture.name.split(' ')[0]!.toLowerCase()}-${marker}@example.com`,
          name: fixture.name,
        },
        select: { id: true },
      });
      const thread = await db.thread.create({
        data: {
          organizationId: org.id,
          customerId: customer.id,
          channelType: 'email',
          status: 'open',
          filterStatus: 'genuine',
          aiSummary: fixture.summary,
          ...(fixture.escalated ? { escalatedAt: new Date(), tag: 'needs_human' } : {}),
        },
        select: { id: true },
      });
      tickets.push(thread.id);
    }

    const ledger = await renderOperatorLedger(org.id, {
      pendingPlans: [],
      pendingPlan: null,
      // The state that used to short-circuit the ledger before it ever reached
      // the digest: a question about a customer the merchant is not asking about.
      pendingQuestion: {
        threadId: tickets[0]!,
        question: 'What should I tell the customer about: "Any tips for making the candle burn evenly? — Sarah"?',
      },
      pendingDigest: {
        items: [
          { threadId: tickets[0]!, kind: 'approval', planId: randomUUID() },
          { threadId: tickets[1]!, kind: 'decision' },
        ],
        sentAt: new Date(Date.now() - 5 * 3_600_000).toISOString(),
      },
    });

    let captured: { ticketId: string; text: string } | null = null;
    const recordingSend = defineTool({
      name: 'send_ticket_reply',
      description:
        'Send a reply to the customer on one of the inbox tickets, using the merchant\'s message. Takes any ticket id from the briefing or from list_active_tickets.',
      fields: {
        ticket_id: stringArg('The ticket id from the briefing or list_active_tickets.', { required: true }),
        text: stringArg('The exact reply text to send to the customer.', { required: true }),
      },
      category: 'communication',
      group: 'thread',
      capabilities: [],
      label: 'Sent ticket reply',
      planStepLabel: 'Send ticket reply',
      policy: { categoryPermission: false },
      execute: async (input: { ticket_id: string; text: string }) => {
        captured = { ticketId: input.ticket_id, text: input.text };
        return toolOk(`Recorded reply to ${input.ticket_id}.`);
      },
    });

    const context: AgentContext = {
      orgId: org.id,
      orgName: org.name,
      // The briefing itself is in the operator thread's history, which is where
      // the "#1024 asked about privacy" link lives. It needs a merchant message
      // ahead of it: `buildMessageHistory` drops leading assistant turns, so a
      // briefing alone would be stripped and the probe would test a context the
      // merchant never has.
      recentMessages: [
        { senderType: 'customer', contentText: "what's waiting on me?" },
        { senderType: 'agent', contentText: BRIEFING },
      ],
      shopify: null,
      escalate: async () => {},
      thread: {
        id: operatorThread.id,
        status: 'open',
        channelType: 'sms_agent',
        tag: null,
        aiSummary: null,
        shopifyCustomerId: null,
      },
      customer: {
        id: operatorCustomer.id,
        name: 'Operator',
        platformId: `operator-${marker}@example.com`,
      },
      openThreadCount: 2,
      recentOrders: [],
      linkedShopifyCustomerName: null,
      kbArticles: [],
      merchantPreferences: [],
      operatorLedger: ledger,
    };

    const result = await runAgent(
      context,
      'Go ahead and send the customer a concise version of the privacy policy',
      undefined,
      undefined,
      {
        turnId: randomUUID(),
        moduleTools: {
          ...buildOperatorInboxTools({ organizationId: org.id }),
          send_ticket_reply: recordingSend,
        },
      },
    );

    // What this probe guarantees is the regression, not the judgment call.
    // "the customer" names nobody, so one confirming question is legitimate
    // behaviour under OPERATOR_INSTRUCTIONS and the model does both across runs.
    // Asserting "it must send" would fail on correct behaviour. So: assert the
    // deterministic half outright, and require only that the model reached the
    // right ticket — by replying on it, or by naming its customer while asking.

    // The ledger is model-independent, so it is assertable rather than reported.
    for (const [label, needle] of [
      ['the privacy ticket id', tickets[1]!],
      ['the other ticket id', tickets[0]!],
      ['the privacy question itself', 'privacy policy'],
      ['the order number that links it to the briefing', '#1024'],
    ] as const) {
      if (!ledger.includes(needle)) {
        throw new Error(`The ledger does not carry ${label} (${needle}).`);
      }
    }

    const failed = result.actionsPerformed.filter(
      (action) => action.status === 'error' || action.status === 'unknown',
    );
    if (failed.length > 0) {
      throw new Error(
        `Tools failed: ${failed.map((a) => `${a.tool}: ${a.result}`).join(' | ')}`,
      );
    }

    const selected = captured as { ticketId: string; text: string } | null;
    if (selected && selected.ticketId !== tickets[1]) {
      throw new Error(
        `The model replied on ${selected.ticketId}; expected the escalated privacy ticket ${tickets[1]}.`,
      );
    }
    // The old failure: a ticket id it invented from the briefing prose.
    if (/\b1024\b/.test(selected?.ticketId ?? '')) {
      throw new Error('The model passed the order number as a ticket id.');
    }
    // Not sending is fine; not finding the ticket is not. Match on the fixture's
    // own customer name rather than on a phrasing, so this fails when the model
    // says there is no such ticket and passes when it asks about the right one.
    if (!selected && !/okafor|dana/i.test(result.summary)) {
      throw new Error(
        `The model neither replied nor identified the privacy ticket. Summary: ${result.summary}`,
      );
    }

    console.log(JSON.stringify({
      status: 'ok',
      outcome: selected ? 'sent' : 'asked a confirming question',
      privacyTicketId: tickets[1],
      otherTicketId: tickets[0],
      selectedTicketId: selected?.ticketId ?? null,
      replyText: selected?.text ?? null,
      summary: result.summary,
      toolCalls: result.actionsPerformed.map((action) => `${action.tool}:${action.status}`),
    }, null, 2));
  } finally {
    await db.organization.delete({ where: { id: org.id } }).catch(() => {});
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

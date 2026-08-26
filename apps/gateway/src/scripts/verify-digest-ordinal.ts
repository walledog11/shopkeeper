import { randomUUID } from 'node:crypto';
import type { AgentContext } from '@shopkeeper/agent/context';
import { loadGatewayEnv } from '../config/load-env.js';

// Live-model probe for the one A2 behavior a phone round-trip left ambiguous:
// resolving "the second" against the exact digest ledger order. The tool is a
// recording stub, so this never sends a customer message.
loadGatewayEnv();

async function main() {
  const { db } = await import('@shopkeeper/db');
  const { runAgent } = await import('@shopkeeper/agent/run');
  const { defineTool, stringArg, toolOk } = await import('@shopkeeper/agent/tools');
  const { renderOperatorLedger } = await import('../message-handlers/operator-ledger.js');

  const marker = randomUUID();
  const org = await db.organization.create({
    data: {
      clerkOrgId: `org_digest_ordinal_${marker}`,
      name: 'Digest Ordinal Verification',
    },
    select: { id: true, name: true },
  });

  try {
    const operatorCustomer = await db.customer.create({
      data: {
        organizationId: org.id,
        platformId: `operator-${marker}@example.com`,
        name: 'Operator',
      },
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

    const ticketIds: string[] = [];
    for (const fixture of [
      { name: 'Sarah Whitcombe', email: `sarah-${marker}@example.com`, summary: 'Unsolicited SEO pitch.' },
      { name: 'Marcus Reed', email: `marcus-${marker}@example.com`, summary: 'Asks when the mug set will ship.' },
    ]) {
      const customer = await db.customer.create({
        data: {
          organizationId: org.id,
          platformId: fixture.email,
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
          filterStatus: 'questionable',
          tag: 'Shipping',
          aiSummary: fixture.summary,
        },
        select: { id: true },
      });
      ticketIds.push(thread.id);
    }

    const ledger = await renderOperatorLedger(org.id, {
      pendingPlans: [],
      pendingPlan: null,
      pendingQuestion: null,
      pendingDigest: {
        items: ticketIds.map((threadId: string) => ({ threadId, kind: 'flagged' as const })),
        threadIds: ticketIds,
        sentAt: new Date().toISOString(),
      },
    });

    let captured: { ticketId: string; text: string } | null = null;
    const sendTicketReply = defineTool({
      name: 'send_ticket_reply',
      description: 'Send the merchant-requested reply to one ticket from the current support digest.',
      fields: {
        ticket_id: stringArg('Exact ticket id from the digest ledger.', { required: true }),
        text: stringArg('Reply text requested by the merchant.', { required: true }),
      },
      category: 'action',
      group: 'messaging',
      capabilities: [],
      label: 'Sent ticket reply',
      planStepLabel: 'Send ticket reply',
      execute: async (input: { ticket_id: string; text: string }) => {
        captured = { ticketId: input.ticket_id, text: input.text };
        return toolOk(`Recorded reply to ${input.ticket_id}: ${input.text}`);
      },
    });

    const context: AgentContext = {
        orgId: org.id,
        orgName: org.name,
        recentMessages: [],
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
      'reply to the second: we ship Friday',
      undefined,
      undefined,
      {
        turnId: randomUUID(),
        moduleTools: { send_ticket_reply: sendTicketReply },
      },
    );

    if (!captured) {
      throw new Error(`The model did not call send_ticket_reply. Summary: ${result.summary}`);
    }
    const selected = captured as { ticketId: string; text: string };
    if (selected.ticketId !== ticketIds[1]) {
      throw new Error(`The model selected ${selected.ticketId}; expected second ticket ${ticketIds[1]}.`);
    }
    if (!/ship\s+friday/i.test(selected.text)) {
      throw new Error(`The model changed the requested reply unexpectedly: ${selected.text}`);
    }

    console.log(JSON.stringify({
      status: 'ok',
      selectedOrdinal: 2,
      selectedTicketId: selected.ticketId,
      replyText: selected.text,
      summary: result.summary,
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

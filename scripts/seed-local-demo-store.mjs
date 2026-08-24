// Seeds inbox customers, a couple of tickets, and order-attention rows for the
// local Shopify demo store so the dashboard customers / orders UI has activity
// to render next to the in-process simulator catalog.
//
// Run: node scripts/seed-local-demo-store.mjs
import { randomUUID } from 'node:crypto';
import { loadLocalEnv } from './load-local-env.mjs';

loadLocalEnv();

const { db } = await import('@shopkeeper/db');

const now = Date.now();
const ago = (minutes) => new Date(now - minutes * 60_000);

const FIXTURES = [
  {
    name: 'Maya Ellison',
    platformId: 'maya.ellison@example.com',
    shopifyCustomerId: '1001',
    channelType: 'email',
    subject: 'Where is my order?',
    tag: 'Shipping',
    minutesAgo: 18,
    customerText: "Hi! I ordered the flax duvet set (order #1042) and the tracking hasn't moved in five days. Is it lost?",
  },
  {
    name: 'Devon Park',
    platformId: 'devon.park@example.com',
    shopifyCustomerId: '1002',
    channelType: 'email',
    subject: 'Damaged on arrival',
    tag: 'Returns',
    minutesAgo: 44,
    customerText: 'The duvet arrived with a six-inch tear along the bottom seam. Order #1051 — I would like a refund.',
  },
  {
    name: 'Priya Raman',
    platformId: 'priya.raman@example.com',
    shopifyCustomerId: '1003',
    channelType: 'email',
    subject: 'Re: Order #1033 — this is my third email',
    tag: 'needs_human',
    minutesAgo: 130,
    customerText: "This is my third email about order #1033. If I don't hear back today I'm filing a chargeback.",
  },
  {
    name: 'Rina Kobayashi',
    platformId: 'rina.kobayashi@example.com',
    shopifyCustomerId: '1007',
    channelType: 'ig_dm',
    subject: null,
    tag: 'Product Inquiry',
    minutesAgo: 96,
    customerText: 'do the framed prints ship to canada? and is there duty on top',
  },
];

async function main() {
  const org = await db.organization.findFirst({
    orderBy: { createdAt: 'desc' },
    include: {
      integrations: {
        where: { platform: 'shopify' },
        select: { id: true, externalAccountId: true, metadata: true },
      },
    },
  });
  if (!org) {
    throw new Error('No local organization found. Start the dashboard and complete onboarding first.');
  }

  const simulated = org.integrations.find((row) => (
    row.externalAccountId === 'demo-store.shopkeeper.test'
    || (row.metadata && typeof row.metadata === 'object' && row.metadata.simulated === true)
  ));
  if (simulated) {
    await db.integration.update({
      where: { id: simulated.id },
      data: { accessToken: 'shopkeeper-development-simulator' },
    });
  }

  for (const fixture of FIXTURES) {
    const customer = await db.customer.upsert({
      where: {
        organizationId_platformId: {
          organizationId: org.id,
          platformId: fixture.platformId,
        },
      },
      update: { name: fixture.name },
      create: {
        organizationId: org.id,
        name: fixture.name,
        platformId: fixture.platformId,
      },
    });

    const existing = await db.thread.findFirst({
      where: {
        organizationId: org.id,
        customerId: customer.id,
        channelType: fixture.channelType,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (existing) continue;

    const thread = await db.thread.create({
      data: {
        organizationId: org.id,
        customerId: customer.id,
        channelType: fixture.channelType,
        status: 'open',
        subject: fixture.subject,
        tag: fixture.tag,
        shopifyCustomerId: fixture.shopifyCustomerId,
        lastMessageAt: ago(fixture.minutesAgo),
        lastMessageSenderType: 'customer',
        aiSummary: fixture.customerText,
      },
    });
    await db.message.create({
      data: {
        organizationId: org.id,
        threadId: thread.id,
        senderType: 'customer',
        contentText: fixture.customerText,
        sentAt: ago(fixture.minutesAgo),
      },
    });
  }

  const flagged = [
    {
      orderId: '6000001042',
      name: '#1042',
      reason: 'No scan in five days after leaving the warehouse.',
      minutesAgo: 40,
    },
    {
      orderId: '6000001033',
      name: '#1033',
      reason: 'First-time customer, $240 unpaid, threatening a chargeback.',
      minutesAgo: 125,
    },
  ];

  for (const finding of flagged) {
    const instruction = `order-risk-review:${finding.orderId}`;
    const existing = await db.agentAction.findFirst({
      where: { organizationId: org.id, tool: 'flag_order', instruction },
      select: { id: true },
    });
    if (existing) continue;
    await db.agentAction.create({
      data: {
        turnId: randomUUID(),
        organizationId: org.id,
        tool: 'flag_order',
        category: 'action',
        input: { order_number: finding.name, reason: finding.reason },
        status: 'escalated',
        mode: 'auto_executed',
        instruction,
        summary: `Flagged order ${finding.name} for review: ${finding.reason}`,
        durationMs: 420,
        executedAt: ago(finding.minutesAgo),
      },
    });
  }

  const shop = org.integrations[0]?.externalAccountId ?? 'demo-store.shopkeeper.test';
  console.log('[seed-local-demo-store] ready', {
    organization: org.name,
    shop,
    customers: await db.customer.count({ where: { organizationId: org.id } }),
    threads: await db.thread.count({ where: { organizationId: org.id, deletedAt: null } }),
    flagged: await db.agentAction.count({ where: { organizationId: org.id, tool: 'flag_order' } }),
  });
}

try {
  await main();
} finally {
  await db.$disconnect();
}

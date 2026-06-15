const { randomUUID } = require('node:crypto');
const { Redis: IORedis } = require('ioredis');
const { ChannelType, PrismaClient, SenderType } = require('@prisma/client');

const db = new PrismaClient();
const DEFAULT_POLL_TIMEOUT_MS = 10_000;
const DEFAULT_POLL_INTERVAL_MS = 500;
let dbTestHelpersPromise;
let agentPlanHelpersPromise;

function getDbTestHelpers() {
  dbTestHelpersPromise ??= import('@shopkeeper/db/test-helpers');
  return dbTestHelpersPromise;
}

async function getAgentPlanHelpers() {
  agentPlanHelpersPromise ??= Promise.all([
    import('@shopkeeper/agent/plan-cache'),
    import('@shopkeeper/agent/settings'),
  ]).then(([planCache, settings]) => ({
    buildAgentPlanCacheRecord: planCache.buildAgentPlanCacheRecord,
    resolveAgentSettings: settings.resolveAgentSettings,
  }));
  return agentPlanHelpersPromise;
}

async function createTestOrg() {
  const { createTestOrg: createSharedTestOrg } = await getDbTestHelpers();
  const org = await createSharedTestOrg();
  return db.organization.update({
    where: { id: org.id },
    data: {
      settings: {
        autoPlanOnOpen: false,
        spamFilterEnabled: false,
      },
    },
  });
}

async function createTestIntegration(orgId, options) {
  const { createTestIntegration: createSharedTestIntegration } = await getDbTestHelpers();
  return createSharedTestIntegration(orgId, options);
}

async function getE2EOrg() {
  const clerkOrgId = process.env.E2E_CLERK_ORG_ID || 'org_e2e_test';
  const org = await db.organization.findUnique({ where: { clerkOrgId } });

  if (!org) {
    throw new Error(`E2E organization ${clerkOrgId} was not seeded`);
  }

  return org;
}

async function ensureE2EEmailIntegration(orgId) {
  const emailAddress = process.env.E2E_TEST_EMAIL_ADDRESS || 'support-e2e@inbound.test';

  return db.integration.upsert({
    where: {
      organizationId_platform_externalAccountId: {
        organizationId: orgId,
        platform: ChannelType.email,
        externalAccountId: emailAddress,
      },
    },
    create: {
      organizationId: orgId,
      platform: ChannelType.email,
      externalAccountId: emailAddress,
      fromEmail: emailAddress,
    },
    update: {
      fromEmail: emailAddress,
    },
  });
}

async function waitForEmailThread(
  {
    orgId,
    customerEmail,
    textIncludes,
    timeoutMs = DEFAULT_POLL_TIMEOUT_MS,
    intervalMs = DEFAULT_POLL_INTERVAL_MS,
  },
) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const thread = await db.thread.findFirst({
      where: {
        organizationId: orgId,
        channelType: ChannelType.email,
        customer: { platformId: customerEmail },
      },
      include: {
        customer: true,
        messages: { orderBy: { sentAt: 'asc' } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (thread?.messages.some((message) => message.contentText.includes(textIncludes))) {
      return thread;
    }

    await sleep(intervalMs);
  }

  throw new Error(`No email thread was created for ${customerEmail} within ${timeoutMs}ms`);
}

async function waitForAgentMessage(
  {
    threadId,
    textIncludes,
    timeoutMs = DEFAULT_POLL_TIMEOUT_MS,
    intervalMs = DEFAULT_POLL_INTERVAL_MS,
  },
) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const message = await db.message.findFirst({
      where: {
        threadId,
        senderType: SenderType.agent,
        contentText: { contains: textIncludes },
      },
      orderBy: { sentAt: 'desc' },
    });

    if (message) {
      return message;
    }

    await sleep(intervalMs);
  }

  throw new Error(`No agent message was created on thread ${threadId} within ${timeoutMs}ms`);
}

async function waitForAgentAuditNote(
  {
    threadId,
    textIncludes,
    timeoutMs = DEFAULT_POLL_TIMEOUT_MS,
    intervalMs = DEFAULT_POLL_INTERVAL_MS,
  },
) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const message = await db.message.findFirst({
      where: {
        threadId,
        senderType: SenderType.note,
        contentText: { contains: textIncludes },
      },
      orderBy: { sentAt: 'desc' },
    });

    if (message) {
      return message;
    }

    await sleep(intervalMs);
  }

  throw new Error(`No agent audit note was created on thread ${threadId} within ${timeoutMs}ms`);
}

async function seedEmailThreadWithCachedPlan(
  {
    orgId,
    customerEmail = `plan-e2e-${randomUUID()}@example.com`,
    customerName = 'Plan E2E Customer',
    inboundText,
    replyText,
    instruction = 'Reply to the customer with the approved answer.',
    tag = 'Plan Approval',
  },
) {
  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { settings: true },
  });
  if (!org) {
    throw new Error(`Organization ${orgId} was not found`);
  }

  const customer = await db.customer.upsert({
    where: {
      organizationId_platformId: {
        organizationId: orgId,
        platformId: customerEmail,
      },
    },
    create: {
      organizationId: orgId,
      platformId: customerEmail,
      name: customerName,
    },
    update: {
      name: customerName,
    },
  });
  const thread = await db.thread.create({
    data: {
      organizationId: orgId,
      customerId: customer.id,
      channelType: ChannelType.email,
      status: 'open',
      tag,
      aiSummary: 'Customer is waiting for a support reply.',
      filterStatus: 'genuine',
      filterReason: 'Seeded E2E support conversation',
      filterDecidedAt: new Date(),
    },
  });
  const customerMessage = await db.message.create({
    data: {
      threadId: thread.id,
      organizationId: orgId,
      senderType: SenderType.customer,
      contentText: inboundText,
      externalMessageId: `<plan-e2e-${randomUUID()}@example.com>`,
    },
  });
  const plan = {
    instruction,
    steps: [
      {
        id: 'send_reply_1',
        tool: 'send_reply',
        label: 'Send reply',
        description: `"${replyText}"`,
        category: 'communication',
        enabled: true,
      },
    ],
    rawToolCalls: [
      {
        id: 'send_reply_1',
        name: 'send_reply',
        input: { text: replyText },
      },
    ],
  };
  const { buildAgentPlanCacheRecord, resolveAgentSettings } = await getAgentPlanHelpers();
  const cachedPlan = buildAgentPlanCacheRecord({
    instruction,
    lastCustomerMessageId: customerMessage.id,
    settings: resolveAgentSettings(org.settings),
    plan,
  });
  const updatedThread = await db.thread.update({
    where: { id: thread.id },
    data: {
      cachedPlan,
      cachedPlanMessageId: customerMessage.id,
      lastMessageAt: customerMessage.sentAt,
    },
  });

  return {
    customer,
    customerMessage,
    plan,
    thread: updatedThread,
  };
}

async function cleanupTestData(orgId) {
  const { cleanupTestData: cleanupSharedTestData } = await getDbTestHelpers();
  return cleanupSharedTestData(orgId);
}

async function disconnectDb() {
  await db.$disconnect();
  if (dbTestHelpersPromise) {
    const { db: sharedDb } = await import('@shopkeeper/db');
    await sharedDb.$disconnect();
  }
}

async function clearRateLimitKey(key, windowSecs = 60) {
  const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:56379/0';
  const redis = new IORedis(redisUrl);
  const now = Math.floor(Date.now() / 1000);
  const windowStart = Math.floor(now / windowSecs);
  const keys = [windowStart - 1, windowStart, windowStart + 1]
    .map((window) => `rl:${key}:${window}`);

  try {
    await redis.del(...keys);
  } finally {
    await redis.quit().catch(() => redis.disconnect());
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  ChannelType,
  SenderType,
  cleanupTestData,
  clearRateLimitKey,
  createTestIntegration,
  createTestOrg,
  db,
  disconnectDb,
  ensureE2EEmailIntegration,
  getE2EOrg,
  seedEmailThreadWithCachedPlan,
  waitForAgentAuditNote,
  waitForAgentMessage,
  waitForEmailThread,
};

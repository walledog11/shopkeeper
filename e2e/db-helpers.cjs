const { createHash, randomUUID } = require('node:crypto');
const { Redis: IORedis } = require('ioredis');
const { ChannelType, PrismaClient, SenderType } = require('@prisma/client');

const db = new PrismaClient();
const DEFAULT_POLL_TIMEOUT_MS = 10_000;
const DEFAULT_POLL_INTERVAL_MS = 500;
const AGENT_PLAN_CACHE_VERSION = 2;
const AGENT_SETTINGS_DEFAULTS = {
  aiContext: '',
  brandVoice: '',
  agentName: 'Clerk',
  autoPlanOnOpen: true,
  defaultInstruction: '',
  requireApprovalForActions: true,
  toolsEnabled: {
    action: true,
    communication: true,
    internal: true,
    read: true,
  },
  maxRefundAmount: null,
  dailyRefundCap: null,
  dailyLLMSpendCapUsd: null,
  blockCancellations: false,
  blockCustomLineItems: false,
  maxIterations: 10,
  replyLanguage: 'auto',
  digestEnabled: false,
  digestFrequency: 'daily',
  digestHour: 8,
  digestSecondHour: 17,
  digestDays: 'every_day',
  digestTimezoneOffset: 0,
  businessHoursEnabled: false,
  businessHoursStart: 9,
  businessHoursEnd: 17,
  businessHoursDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
  businessHoursTimezoneOffset: 0,
  autoAckMessage: "Thanks for reaching out! We're currently outside business hours and will get back to you soon.",
  spamFilterEnabled: true,
  autonomyTier: 'trusted',
};

async function createTestOrg() {
  const uid = randomUUID();
  return db.organization.create({
    data: {
      clerkOrgId: `org_test_${uid}`,
      name: `Test Org ${uid.slice(0, 8)}`,
      settings: {
        autoPlanOnOpen: false,
        spamFilterEnabled: false,
      },
    },
  });
}

async function createTestIntegration(
  orgId,
  {
    platform = ChannelType.email,
    externalAccountId = `test_${randomUUID()}`,
    accessToken = null,
    fromEmail = null,
  } = {},
) {
  return db.integration.create({
    data: { organizationId: orgId, platform, externalAccountId, accessToken, fromEmail },
  });
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
  const cachedPlan = buildAgentPlanCacheRecord({
    instruction,
    lastCustomerMessageId: customerMessage.id,
    settings: resolveE2EAgentSettings(org.settings),
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
  if (!orgId) return;
  await db.organization.delete({ where: { id: orgId } }).catch(() => undefined);
}

async function disconnectDb() {
  await db.$disconnect();
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

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function resolveE2EAgentSettings(settings) {
  const base = isRecord(settings) ? settings : {};
  const baseToolsEnabled = isRecord(base.toolsEnabled) ? base.toolsEnabled : {};

  return {
    ...AGENT_SETTINGS_DEFAULTS,
    ...base,
    toolsEnabled: {
      ...AGENT_SETTINGS_DEFAULTS.toolsEnabled,
      ...baseToolsEnabled,
    },
  };
}

function buildAgentPlanCacheRecord({ instruction, lastCustomerMessageId, settings, plan }) {
  return {
    version: AGENT_PLAN_CACHE_VERSION,
    instruction,
    lastCustomerMessageId,
    settingsFingerprint: createHash('sha256').update(JSON.stringify(settings ?? null)).digest('hex'),
    plan,
  };
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

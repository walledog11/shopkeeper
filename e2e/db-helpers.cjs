const { randomUUID } = require('node:crypto');
const { ChannelType, PrismaClient, SenderType } = require('@prisma/client');

const db = new PrismaClient();
const DEFAULT_POLL_TIMEOUT_MS = 10_000;
const DEFAULT_POLL_INTERVAL_MS = 500;

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

async function cleanupTestData(orgId) {
  if (!orgId) return;
  await db.organization.delete({ where: { id: orgId } }).catch(() => undefined);
}

async function disconnectDb() {
  await db.$disconnect();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  ChannelType,
  cleanupTestData,
  createTestIntegration,
  createTestOrg,
  db,
  disconnectDb,
  ensureE2EEmailIntegration,
  getE2EOrg,
  waitForAgentMessage,
  waitForEmailThread,
};

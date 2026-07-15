import {
  db,
  ChannelType,
  EmailProvider,
  SenderType,
  type DbChannelType,
  type DbEmailProvider,
  type DbSenderType,
} from './index.js';
import { randomUUID } from 'crypto';

export async function createTestOrg() {
  const uid = randomUUID();
  return db.organization.create({
    data: {
      clerkOrgId: `org_test_${uid}`,
      name: `Test Org ${uid.slice(0, 8)}`,
    },
  });
}

export async function createTestIntegration(
  orgId: string,
  options: {
    platform?: DbChannelType;
    externalAccountId?: string;
    accessToken?: string | null;
    emailProvider?: DbEmailProvider | null;
    fromEmail?: string | null;
    metadata?: Record<string, unknown>;
    refreshToken?: string | null;
  } = {},
) {
  const {
    platform = ChannelType.email,
    externalAccountId = `test_${randomUUID()}`,
    accessToken = null,
    emailProvider = platform === ChannelType.email ? EmailProvider.postmark : null,
    fromEmail = null,
    metadata,
    refreshToken = null,
  } = options;
  return db.integration.create({
    data: {
      organizationId: orgId,
      platform,
      externalAccountId,
      accessToken,
      emailProvider,
      fromEmail,
      refreshToken,
      ...(metadata && { metadata }),
    },
  });
}

export async function createTestCustomer(
  orgId: string,
  platformId: string,
  options: { name?: string } = {},
) {
  return db.customer.create({
    data: { organizationId: orgId, platformId, name: options.name ?? null },
  });
}

export async function createTestThread(
  orgId: string,
  customerId: string,
  channel: DbChannelType,
  options: { tag?: string } = {},
) {
  return db.thread.create({
    data: {
      organizationId: orgId,
      customerId,
      channelType: channel,
      status: 'open',
      tag: options.tag ?? 'Support',
    },
  });
}

export async function createTestMessage(
  threadId: string,
  content: string,
  senderType: DbSenderType = SenderType.customer,
) {
  const thread = await db.thread.findUniqueOrThrow({
    where: { id: threadId },
    select: { organizationId: true },
  });
  return db.message.create({
    data: { threadId, organizationId: thread.organizationId, contentText: content, senderType },
  });
}

export async function cleanupTestData(orgId?: string | null) {
  if (!orgId) return;
  await db.organization.delete({ where: { id: orgId } }).catch(() => undefined);
}

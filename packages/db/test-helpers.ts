import { db, ChannelType, SenderType } from './index.js';
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
    platform?: ChannelType;
    externalAccountId?: string;
    accessToken?: string | null;
    fromEmail?: string | null;
  } = {},
) {
  const {
    platform = ChannelType.email,
    externalAccountId = `test_${randomUUID()}`,
    accessToken = null,
    fromEmail = null,
  } = options;
  return db.integration.create({
    data: { organizationId: orgId, platform, externalAccountId, accessToken, fromEmail },
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
  channel: ChannelType,
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
  senderType: SenderType = SenderType.customer,
) {
  return db.message.create({
    data: { threadId, contentText: content, senderType },
  });
}

export async function cleanupTestData(orgId: string) {
  await db.organization.delete({ where: { id: orgId } }).catch(() => undefined);
}

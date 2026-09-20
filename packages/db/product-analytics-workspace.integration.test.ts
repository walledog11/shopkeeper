import { afterEach, describe, expect, it } from 'vitest';
import { ChannelType, SenderType, loadWorkspaceActivationSnapshot } from './index.js';
import {
  cleanupTestData,
  createTestCustomer,
  createTestIntegration,
  createTestMessage,
  createTestOrg,
  createTestThread,
} from './test-helpers.js';

let organizationId: string | null = null;

afterEach(async () => {
  if (organizationId) await cleanupTestData(organizationId);
  organizationId = null;
});

async function seedConnectedOrg() {
  const org = await createTestOrg();
  organizationId = org.id;
  await createTestIntegration(org.id, {
    platform: ChannelType.shopify,
    accessToken: 'shpat_test',
  });
  await createTestIntegration(org.id, { platform: ChannelType.email });
  return org;
}

async function seedInbound(orgId: string, channel: typeof ChannelType[keyof typeof ChannelType]) {
  const customer = await createTestCustomer(orgId, `platform_${channel}_${orgId}`);
  const thread = await createTestThread(orgId, customer.id, channel);
  return createTestMessage(thread.id, 'hello', SenderType.customer);
}

describe('loadWorkspaceActivationSnapshot', () => {
  it('returns a snapshot once both integrations and one inbound message exist', async () => {
    const org = await seedConnectedOrg();
    await seedInbound(org.id, ChannelType.email);

    const snapshot = await loadWorkspaceActivationSnapshot(org.id);

    expect(snapshot).toEqual({
      organizationCreatedAt: expect.any(Date),
      inboundMessageCount: 1,
      hasShopifyIntegration: true,
      hasEmailIntegration: true,
    });
  });

  it('counts storefront chat as a customer-origin activation channel', async () => {
    const org = await seedConnectedOrg();
    await seedInbound(org.id, ChannelType.shopify_chat);

    const snapshot = await loadWorkspaceActivationSnapshot(org.id);

    expect(snapshot?.inboundMessageCount).toBe(1);
  });

  it('does not count operator threads as customer inbound', async () => {
    const org = await seedConnectedOrg();
    await seedInbound(org.id, ChannelType.operator);

    expect(await loadWorkspaceActivationSnapshot(org.id)).toBeNull();
  });

  it('does not count agent replies as inbound', async () => {
    const org = await seedConnectedOrg();
    const customer = await createTestCustomer(org.id, `platform_agent_${org.id}`);
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);
    await createTestMessage(thread.id, 'reply', SenderType.agent);

    expect(await loadWorkspaceActivationSnapshot(org.id)).toBeNull();
  });

  it('requires a Shopify integration that still holds a token', async () => {
    const org = await createTestOrg();
    organizationId = org.id;
    await createTestIntegration(org.id, {
      platform: ChannelType.shopify,
      accessToken: null,
    });
    await createTestIntegration(org.id, { platform: ChannelType.email });
    await seedInbound(org.id, ChannelType.email);

    expect(await loadWorkspaceActivationSnapshot(org.id)).toBeNull();
  });

  it('requires an email integration alongside Shopify', async () => {
    const org = await createTestOrg();
    organizationId = org.id;
    await createTestIntegration(org.id, {
      platform: ChannelType.shopify,
      accessToken: 'shpat_test',
    });
    await seedInbound(org.id, ChannelType.email);

    expect(await loadWorkspaceActivationSnapshot(org.id)).toBeNull();
  });
});

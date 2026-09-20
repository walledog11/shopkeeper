import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelType, SenderType, db } from '@shopkeeper/db';
import {
  cleanupTestData, createTestMessage,
  createTestCustomer,
  createTestIntegration,
  createTestOrg,
  createTestThread,
} from '@shopkeeper/db/test-helpers';
import { acceptCustomerAgentRequest } from '@shopkeeper/agent/task-ledger';
import { POST } from './route';

let org!: Awaited<ReturnType<typeof createTestOrg>>;

beforeEach(async () => {
  vi.stubEnv('INTERNAL_API_SECRET', 'storefront-dispatch-secret');
  org = await createTestOrg();
});

afterEach(async () => {
  await cleanupTestData(org?.id);
  vi.unstubAllEnvs();
});

describe('POST /api/agent/io-send-internal storefront persistence', () => {
  it.each([
    ['human_approved', 'Approved storefront reply.'],
    ['auto_executed', 'Automatic storefront reply.'],
  ] as const)('persists a %s send_reply for the widget to poll', async (agentActionMode, text) => {
    const shopDomain = `storefront-${agentActionMode}-${org.id.slice(0, 8)}.myshopify.com`;
    const integration = await createTestIntegration(org.id, {
      platform: ChannelType.shopify,
      externalAccountId: shopDomain,
      metadata: { storefrontChat: { enabled: true } },
    });
    const customer = await createTestCustomer(org.id, `shopify_chat:${agentActionMode}:${org.id}`);
    const thread = await createTestThread(org.id, customer.id, ChannelType.shopify_chat);
    const sourceMessage = await createTestMessage(thread.id, 'Where is my order?');
    const { request: agentRequest, task: agentTask } = await acceptCustomerAgentRequest({
      organizationId: org.id,
      threadId: thread.id,
      sourceMessageId: sourceMessage.id,
      objective: 'Answer the order-status question',
      budget: {
        runtimeVersion: 1,
        modelCallLimit: 20,
        activeTimeMsLimit: 300_000,
        spendNanoUsdLimit: BigInt(1_000_000_000),
      },
    });
    await db.storefrontChatSession.create({
      data: {
        organizationId: org.id,
        integrationId: integration.id,
        customerId: customer.id,
        threadId: thread.id,
        storefrontHost: shopDomain,
        resumeSecretHash: 'a'.repeat(64),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    const response = await POST(new Request('http://localhost/api/agent/io-send-internal', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-internal-secret': 'storefront-dispatch-secret',
      },
      body: JSON.stringify({
        agentActionMode,
        orgId: org.id,
        threadId: thread.id,
        op: 'send_reply',
        input: { text },
        agentRequestId: agentRequest.id,
        agentTaskId: agentTask.id,
      }),
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ status: 'ok' });
    const saved = await db.message.findFirstOrThrow({
      where: { threadId: thread.id, senderType: SenderType.agent },
    });
    expect(saved.contentText).toBe(text);
    expect(saved.integrationId).toBe(integration.id);
    expect(saved.providerMessageId).toBeNull();
    expect(saved.agentRequestId).toBe(agentRequest.id);
    expect(saved.agentTaskId).toBe(agentTask.id);
  });
});

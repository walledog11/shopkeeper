/**
 * E2E: Webhook ingest flow (no UI auth required)
 *
 * Tests the full inbound pipeline without a browser:
 *   POST inbound email → gateway enqueues job → worker processes →
 *   thread + message appear via /api/threads (internal check)
 *
 * Requires both servers to be running (handled by playwright.config.ts webServer).
 */
import { test, expect } from '@playwright/test';
import { createHmac, randomUUID } from 'node:crypto';
import dbHelpers from './db-helpers.cjs';
import outboundHelpers from './outbound-helpers.cjs';

const { ChannelType, SenderType, cleanupTestData, createTestIntegration, createTestOrg, db, disconnectDb } = dbHelpers;
const { readOutboundRecords } = outboundHelpers;
const gatewayUrl = process.env.GATEWAY_INTERNAL_URL ?? 'http://localhost:8180';

function getInstagramWebhookSecret() {
  return (
    process.env.INSTAGRAM_WEBHOOK_APP_SECRET
    || process.env.INSTAGRAM_APP_SECRET
    || 'test-instagram-webhook-secret'
  );
}

let orgId: string;

test.beforeAll(async () => {
  const org = await createTestOrg();
  orgId = org.id;
});

test.afterAll(async () => {
  await cleanupTestData(orgId);
  await disconnectDb();
});

test('inbound email webhook creates a thread and message in the database', async ({ request }) => {
  const inboundAddress = `${orgId}@inbound.test`;
  await createTestIntegration(orgId, {
    platform: ChannelType.email,
    externalAccountId: inboundAddress,
  });

  const res = await request.post(`${gatewayUrl}/webhooks/email/inbound`, {
    form: {
      From: 'E2E Tester <e2e@example.com>',
      OriginalRecipient: inboundAddress,
      To: inboundAddress,
      Subject: 'E2E test email',
      TextBody: 'This is an automated test message.',
    },
  });

  const responseText = await res.text();
  expect(res.ok(), `Expected email webhook 2xx, got ${res.status()}: ${responseText}`).toBeTruthy();
  expect(responseText).toBe('OK');

  // Poll the DB (up to 10s) for the worker to process the job
  let thread = null;
  for (let i = 0; i < 20; i++) {
    thread = await db.thread.findFirst({
      where: { organizationId: orgId, channelType: ChannelType.email },
      include: { messages: true },
    });
    if (thread?.messages.length) break;
    await new Promise(r => setTimeout(r, 500));
  }

  expect(thread, 'no thread was created within 10 seconds').not.toBeNull();
  expect(thread!.messages.length).toBeGreaterThanOrEqual(1);
  expect(thread!.messages[0].contentText).toContain('automated test message');
});

test('inbound IG DM webhook persists a thread and message in the database', async ({ request }) => {
  const igPageId = `e2e_ig_page_${orgId.slice(0, 8)}`;
  await createTestIntegration(orgId, {
    platform: ChannelType.ig_dm,
    externalAccountId: igPageId,
    accessToken: 'instagram-long-lived-token',
    metadata: { instagram: { authModel: 'instagram_login' } },
  });

  const runId = randomUUID();
  const senderId = `e2e_ig_sender_${runId}`;
  const messageText = `E2E IG message ${runId}`;
  const messageMid = `mid.e2e.${runId}`;
  const secret = getInstagramWebhookSecret();
  const payload = JSON.stringify({
    object: 'instagram',
    entry: [
      {
        id: igPageId,
        messaging: [
          {
            sender: { id: senderId },
            timestamp: Date.now(),
            message: { text: messageText, mid: messageMid },
          },
        ],
      },
    ],
  });
  const sig = `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`;

  const res = await request.post(`${gatewayUrl}/webhooks/meta`, {
    headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': sig },
    data: Buffer.from(payload),
  });

  const responseText = await res.text();
  expect(res.ok(), `Expected IG webhook 2xx, got ${res.status()}: ${responseText}`).toBeTruthy();
  expect(responseText).toBe('EVENT_RECEIVED');

  let thread = null;
  for (let i = 0; i < 20; i++) {
    thread = await db.thread.findFirst({
      where: {
        organizationId: orgId,
        channelType: ChannelType.ig_dm,
        customer: { platformId: senderId },
      },
      include: {
        customer: true,
        messages: { orderBy: { sentAt: 'asc' } },
      },
      orderBy: { updatedAt: 'desc' },
    });
    if (thread?.messages.some(message => (
      message.externalMessageId === messageMid &&
      message.contentText === messageText
    ))) {
      break;
    }
    await new Promise(r => setTimeout(r, 500));
  }

  expect(thread, 'no IG DM thread was created within 10 seconds').not.toBeNull();
  expect(thread!.messages).toContainEqual(
    expect.objectContaining({
      senderType: 'customer',
      contentText: messageText,
      externalMessageId: messageMid,
    }),
  );
});

test('filtered spam email webhook skips cached plans, outbound sends, and agent replies', async ({ request }) => {
  await db.organization.update({
    where: { id: orgId },
    data: {
      settings: {
        autoPlanOnOpen: true,
        spamFilterEnabled: true,
      },
    },
  });

  const runId = randomUUID();
  const inboundAddress = `${orgId}@inbound.test`;
  const customerEmail = `filtered-spam-${runId}@example.com`;
  const spamMarker = 'E2E_FILTERED_SPAM';
  const bodyText = `${spamMarker} buy followers and fake engagement ${runId}`;

  const res = await request.post(`${gatewayUrl}/webhooks/email/inbound`, {
    form: {
      From: `Filtered Spam <${customerEmail}>`,
      OriginalRecipient: inboundAddress,
      To: inboundAddress,
      Subject: `${spamMarker} promotional blast ${runId}`,
      TextBody: bodyText,
    },
  });

  const responseText = await res.text();
  expect(res.ok(), `Expected spam email webhook 2xx, got ${res.status()}: ${responseText}`).toBeTruthy();
  expect(responseText).toBe('OK');

  let thread = null;
  for (let i = 0; i < 20; i++) {
    thread = await db.thread.findFirst({
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
    if (thread?.filterStatus === 'filtered' && thread.messages.some(message => message.contentText === bodyText)) {
      break;
    }
    await new Promise(r => setTimeout(r, 500));
  }

  expect(thread, 'no filtered spam thread was created within 10 seconds').not.toBeNull();
  expect(thread!.filterStatus).toBe('filtered');
  expect(thread!.filterReason).toBe('Deterministic E2E spam marker');
  expect(thread!.filterDecidedAt).not.toBeNull();
  expect(thread!.cachedPlan).toBeNull();
  expect(thread!.cachedPlanMessageId).toBeNull();
  expect(thread!.messages).toContainEqual(
    expect.objectContaining({
      senderType: SenderType.customer,
      contentText: bodyText,
    }),
  );

  const outboundRecords = await readOutboundRecords();
  expect(outboundRecords).not.toContainEqual(expect.objectContaining({ threadId: thread!.id }));

  const agentMessageCount = await db.message.count({
    where: { threadId: thread!.id, senderType: SenderType.agent },
  });
  expect(agentMessageCount).toBe(0);
});

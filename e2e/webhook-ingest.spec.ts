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
import dbHelpers from './db-helpers.cjs';

const { ChannelType, cleanupTestData, createTestIntegration, createTestOrg, db, disconnectDb } = dbHelpers;
const gatewayUrl = process.env.GATEWAY_INTERNAL_URL ?? 'http://localhost:8180';

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
  const emailAddress = `e2e_${orgId.slice(0, 8)}@inbound.test`;
  await createTestIntegration(orgId, {
    platform: ChannelType.email,
    externalAccountId: emailAddress,
  });

  const res = await request.post(`${gatewayUrl}/webhooks/email/inbound`, {
    form: {
      From: 'E2E Tester <e2e@example.com>',
      To: emailAddress,
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

test('inbound IG DM webhook enqueues the job and gateway returns 200', async ({ request }) => {
  const igPageId = `e2e_ig_page_${orgId.slice(0, 8)}`;
  await createTestIntegration(orgId, {
    platform: ChannelType.ig_dm,
    externalAccountId: igPageId,
  });

  const { createHmac } = await import('crypto');
  const secret = process.env.META_APP_SECRET ?? 'test-meta-secret';
  const payload = JSON.stringify({
    object: 'instagram',
    entry: [
      {
        id: igPageId,
        messaging: [
          { sender: { id: 'e2e_ig_sender' }, message: { text: 'E2E IG message', mid: 'mid.e2e001' } },
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
});

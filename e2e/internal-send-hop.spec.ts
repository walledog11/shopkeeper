import { expect, test } from '@playwright/test';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { promisify } from 'node:util';
import dbHelpers from './db-helpers.cjs';
import outboundHelpers from './outbound-helpers.cjs';

const {
  ChannelType,
  SenderType,
  cleanupTestData,
  createTestOrg,
  db,
  disconnectDb,
  ensureE2EEmailIntegration,
} = dbHelpers;
const { waitForOutboundRecord } = outboundHelpers;
const execFileAsync = promisify(execFile);

const orgIdsToCleanup = new Set<string>();

test.afterAll(async () => {
  for (const orgId of orgIdsToCleanup) {
    await cleanupTestData(orgId);
  }
  await disconnectDb();
});

test('gateway ThreadSink crosses the internal dashboard hop and commits send_reply', async () => {
  expect(process.env.E2E_OUTBOUND_MODE).toBe('record');
  expect(process.env.OUTBOUND_EMAIL_ASYNC).toBe('false');

  const org = await createTestOrg();
  orgIdsToCleanup.add(org.id);
  await ensureE2EEmailIntegration(org.id);

  const runId = randomUUID();
  const replyText = `cross-service send_reply canary ${runId}`;
  const customer = await db.customer.create({
    data: {
      organizationId: org.id,
      platformId: `send-hop-${runId}@example.com`,
      name: 'Internal Send Hop Canary',
    },
  });
  const thread = await db.thread.create({
    data: {
      organizationId: org.id,
      customerId: customer.id,
      channelType: ChannelType.email,
      status: 'open',
      subject: `Internal send hop ${runId}`,
      tag: 'Internal Send Canary',
      filterStatus: 'genuine',
      filterReason: 'Seeded cross-service send canary',
      filterDecidedAt: new Date(),
    },
  });
  await db.message.create({
    data: {
      threadId: thread.id,
      organizationId: org.id,
      senderType: SenderType.customer,
      contentText: `Canary inbound ${runId}`,
      externalMessageId: `<send-hop-${runId}@example.com>`,
    },
  });

  const tsxPath = path.join(process.cwd(), 'node_modules', '.bin', 'tsx');
  const { stdout } = await execFileAsync(tsxPath, [
    'apps/gateway/src/scripts/canary-dashboard-send-reply-hop.ts',
    `--org-id=${org.id}`,
    `--thread-id=${thread.id}`,
    `--text=${replyText}`,
    '--execute',
  ], {
    cwd: process.cwd(),
    env: process.env,
    timeout: 30_000,
  });
  expect(stdout).toContain(
    'CANARY_RESULT={"status":"ok","message":"Reply sent to customer via email."}',
  );

  const outbound = await waitForOutboundRecord(
    (record: {
      threadId?: string;
      organizationId?: string;
      source?: string;
      channel?: string;
      text?: string;
    }) => (
      record.threadId === thread.id
      && record.organizationId === org.id
      && record.source === 'agent_send_reply'
      && record.channel === 'email'
      && record.text === replyText
    ),
  );
  expect(outbound.provider).toBe('postmark');

  const messages = await db.message.findMany({
    where: {
      threadId: thread.id,
      senderType: SenderType.agent,
      contentText: replyText,
    },
    select: {
      id: true,
      integrationId: true,
      organizationId: true,
      sendStatus: true,
    },
  });
  expect(messages).toHaveLength(1);
  expect(messages[0]).toMatchObject({
    organizationId: org.id,
    sendStatus: null,
  });
  expect(messages[0]?.id).toBeTruthy();
  expect(messages[0]?.integrationId).toBeTruthy();
});

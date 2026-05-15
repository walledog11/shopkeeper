import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ChannelType, SenderType, db } from '@clerk/db';
import {
  cleanupTestData,
  createTestCustomer,
  createTestIntegration,
  createTestOrg,
  createTestThread,
} from '@clerk/db/test-helpers';
import { readOutboundRecords } from '@/lib/server/outbound-recorder';
import { sendEmail, sendReply } from './thread';

let org!: Awaited<ReturnType<typeof createTestOrg>>;
let tempDir: string | null = null;
const originalEnv = {
  E2E_OUTBOUND_MODE: process.env.E2E_OUTBOUND_MODE,
  E2E_OUTBOUND_RECORD_PATH: process.env.E2E_OUTBOUND_RECORD_PATH,
  POSTMARK_API_KEY: process.env.POSTMARK_API_KEY,
};

beforeEach(async () => {
  org = await createTestOrg();
  tempDir = await mkdtemp(path.join(os.tmpdir(), 'clerk-agent-records-'));
  process.env.E2E_OUTBOUND_MODE = 'record';
  process.env.E2E_OUTBOUND_RECORD_PATH = path.join(tempDir, 'records.jsonl');
  delete process.env.POSTMARK_API_KEY;
});

afterEach(async () => {
  await cleanupTestData(org?.id);
  process.env.E2E_OUTBOUND_MODE = originalEnv.E2E_OUTBOUND_MODE;
  process.env.E2E_OUTBOUND_RECORD_PATH = originalEnv.E2E_OUTBOUND_RECORD_PATH;
  process.env.POSTMARK_API_KEY = originalEnv.POSTMARK_API_KEY;

  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

describe('sendReply outbound recording', () => {
  it('records an email reply and persists the agent message without Postmark credentials', async () => {
    const emailAddress = `support_${org.id.slice(0, 8)}@example.com`;
    await createTestIntegration(org.id, {
      platform: ChannelType.email,
      externalAccountId: emailAddress,
      fromEmail: emailAddress,
    });
    const customer = await createTestCustomer(org.id, 'customer@example.com');
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);

    const result = await sendReply(
      { text: 'Recorded agent reply.' },
      { threadId: thread.id, orgId: org.id, orgName: org.name },
    );

    expect(result).toBe('Reply sent to customer via email.');
    const records = await readOutboundRecords();
    expect(records).toMatchObject([
      {
        source: 'agent_send_reply',
        provider: 'postmark',
        channel: 'email',
        organizationId: org.id,
        threadId: thread.id,
        to: 'customer@example.com',
        from: emailAddress,
        text: 'Recorded agent reply.',
      },
    ]);

    const saved = await db.message.findFirst({
      where: { threadId: thread.id, senderType: SenderType.agent },
    });
    expect(saved?.contentText).toBe('Recorded agent reply.');
  });

  it('records a Gmail reply with the Gmail provider', async () => {
    const emailAddress = `gmail_${org.id.slice(0, 8)}@example.com`;
    await db.integration.create({
      data: {
        organizationId: org.id,
        platform: ChannelType.email,
        externalAccountId: emailAddress,
        fromEmail: emailAddress,
        accessToken: 'gmail-access-token',
        refreshToken: 'gmail-refresh-token',
        tokenExpiresAt: new Date(Date.now() + 3600_000),
        metadata: { provider: 'gmail' },
      },
    });
    const customer = await createTestCustomer(org.id, 'gmail-customer@example.com');
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);

    const result = await sendReply(
      { text: 'Recorded Gmail reply.' },
      { threadId: thread.id, orgId: org.id, orgName: org.name },
    );

    expect(result).toBe('Reply sent to customer via email.');
    const records = await readOutboundRecords();
    expect(records).toMatchObject([
      {
        source: 'agent_send_reply',
        provider: 'gmail',
        channel: 'email',
        organizationId: org.id,
        threadId: thread.id,
        to: 'gmail-customer@example.com',
        from: emailAddress,
        text: 'Recorded Gmail reply.',
      },
    ]);
  });
});

describe('sendEmail outbound recording', () => {
  it('records a new Outlook email with the Outlook provider', async () => {
    const emailAddress = `outlook_${org.id.slice(0, 8)}@example.com`;
    await db.integration.create({
      data: {
        organizationId: org.id,
        platform: ChannelType.email,
        externalAccountId: emailAddress,
        fromEmail: emailAddress,
        accessToken: 'outlook-access-token',
        refreshToken: 'outlook-refresh-token',
        tokenExpiresAt: new Date(Date.now() + 3600_000),
        metadata: { provider: 'outlook' },
      },
    });

    const result = await sendEmail(
      { to: 'prospect@example.com', subject: 'Sizing question', body: 'Recorded Outlook email.' },
      { threadId: 'unused-for-send-email', orgId: org.id, orgName: org.name },
    );

    expect(result).toBe('Email sent to prospect@example.com and a new ticket was opened.');
    const records = await readOutboundRecords();
    expect(records).toMatchObject([
      {
        source: 'agent_send_email',
        provider: 'outlook',
        channel: 'email',
        organizationId: org.id,
        to: 'prospect@example.com',
        from: emailAddress,
        subject: 'Sizing question',
        text: 'Recorded Outlook email.',
      },
    ]);

    const saved = await db.message.findFirst({
      where: { contentText: 'Recorded Outlook email.', senderType: SenderType.agent },
    });
    expect(saved).not.toBeNull();
  });
});

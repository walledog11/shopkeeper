import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ChannelType, SenderType, db } from '@shopkeeper/db';
import { EmailNotConfiguredError } from '@shopkeeper/email';
import {
  createTestOrg,
  createTestIntegration,
  createTestCustomer,
  createTestThread,
  cleanupTestData,
} from '@shopkeeper/db/test-helpers';
import type { OutboundEmailJobData } from '../types.js';

const sendMock = vi.fn();

vi.mock('@shopkeeper/email', async (importActual) => {
  const actual = await importActual<typeof import('@shopkeeper/email')>();
  return { ...actual, getEmailSender: () => ({ send: sendMock }) };
});

vi.mock('../logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { handleOutboundEmailJob } from './outbound-email.js';

type OutboundJob = Parameters<typeof handleOutboundEmailJob>[0];

function makeJob(
  data: OutboundEmailJobData,
  opts: { attempts?: number; attemptsMade?: number } = {},
): OutboundJob {
  return {
    data,
    opts: { attempts: opts.attempts ?? 3 },
    attemptsMade: opts.attemptsMade ?? 0,
  } as unknown as OutboundJob;
}

let org: Awaited<ReturnType<typeof createTestOrg>>;

async function seed(sendStatus: string) {
  const integration = await createTestIntegration(org.id, {
    externalAccountId: 'support@store.com',
    accessToken: 'token',
    fromEmail: 'support@store.com',
  });
  const customer = await createTestCustomer(org.id, 'customer@example.com', { name: 'Cust' });
  const thread = await createTestThread(org.id, customer.id, ChannelType.email);
  const message = await db.message.create({
    data: {
      threadId: thread.id,
      organizationId: org.id,
      senderType: SenderType.agent,
      contentText: 'Hello there',
      sendStatus,
    },
  });
  const data: OutboundEmailJobData = {
    organizationId: org.id,
    messageId: message.id,
    threadId: thread.id,
    integrationId: integration.id,
    source: 'agent_send_reply',
  };
  return { integration, customer, thread, message, data };
}

describe('handleOutboundEmailJob', () => {
  beforeEach(async () => {
    org = await createTestOrg();
    sendMock.mockReset();
  });

  afterEach(async () => {
    await cleanupTestData(org?.id);
  });

  it('sends and marks the message sent', async () => {
    sendMock.mockResolvedValueOnce(undefined);
    const { message, data } = await seed('pending');

    await handleOutboundEmailJob(makeJob(data));

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock.mock.calls[0][0]).toMatchObject({
      to: 'customer@example.com',
      fromAddress: 'support@store.com',
      text: 'Hello there',
    });
    const after = await db.message.findUnique({ where: { id: message.id } });
    expect(after?.sendStatus).toBe('sent');
    expect(after?.sendError).toBeNull();
  });

  it('skips a message that is already sent (idempotency)', async () => {
    const { message, data } = await seed('sent');

    await handleOutboundEmailJob(makeJob(data));

    expect(sendMock).not.toHaveBeenCalled();
    const after = await db.message.findUnique({ where: { id: message.id } });
    expect(after?.sendStatus).toBe('sent');
  });

  it('rethrows and leaves the message pending on a non-final transient failure', async () => {
    sendMock.mockRejectedValueOnce(new Error('503 upstream'));
    const { message, data } = await seed('pending');

    await expect(
      handleOutboundEmailJob(makeJob(data, { attemptsMade: 0, attempts: 3 })),
    ).rejects.toThrow('503 upstream');

    const after = await db.message.findUnique({ where: { id: message.id } });
    expect(after?.sendStatus).toBe('pending');
    expect(after?.sendError).toBeNull();
  });

  it('marks the message failed and rethrows on the final transient failure', async () => {
    sendMock.mockRejectedValueOnce(new Error('503 upstream'));
    const { message, data } = await seed('pending');

    await expect(
      handleOutboundEmailJob(makeJob(data, { attemptsMade: 2, attempts: 3 })),
    ).rejects.toThrow('503 upstream');

    const after = await db.message.findUnique({ where: { id: message.id } });
    expect(after?.sendStatus).toBe('failed');
    expect(after?.sendError).toContain('503 upstream');
  });

  it('sends an agent-initiated new-thread email with the subject verbatim (no Re:)', async () => {
    sendMock.mockResolvedValueOnce(undefined);
    const integration = await createTestIntegration(org.id, {
      externalAccountId: 'support@store.com',
      accessToken: 'token',
      fromEmail: 'support@store.com',
    });
    const customer = await createTestCustomer(org.id, 'prospect@example.com', { name: 'P' });
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);
    await db.thread.update({ where: { id: thread.id }, data: { subject: 'New product launch' } });
    const message = await db.message.create({
      data: {
        threadId: thread.id,
        organizationId: org.id,
        senderType: SenderType.agent,
        contentText: 'Check this out',
        sendStatus: 'pending',
      },
    });

    await handleOutboundEmailJob(
      makeJob({
        organizationId: org.id,
        messageId: message.id,
        threadId: thread.id,
        integrationId: integration.id,
        source: 'agent_send_email',
      }),
    );

    expect(sendMock.mock.calls[0][0]).toMatchObject({ subject: 'New product launch' });
  });

  it('prefixes Re: when agent_send_email replies into a thread with inbound mail', async () => {
    sendMock.mockResolvedValueOnce(undefined);
    const integration = await createTestIntegration(org.id, {
      externalAccountId: 'support@store.com',
      accessToken: 'token',
      fromEmail: 'support@store.com',
    });
    const customer = await createTestCustomer(org.id, 'cust@example.com', { name: 'C' });
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);
    await db.thread.update({ where: { id: thread.id }, data: { subject: 'Order help' } });
    await db.message.create({
      data: {
        threadId: thread.id,
        organizationId: org.id,
        senderType: SenderType.customer,
        contentText: 'help',
        externalMessageId: '<inbound@x>',
      },
    });
    const message = await db.message.create({
      data: {
        threadId: thread.id,
        organizationId: org.id,
        senderType: SenderType.agent,
        contentText: 'reply',
        sendStatus: 'pending',
      },
    });

    await handleOutboundEmailJob(
      makeJob({
        organizationId: org.id,
        messageId: message.id,
        threadId: thread.id,
        integrationId: integration.id,
        source: 'agent_send_email',
      }),
    );

    expect(sendMock.mock.calls[0][0]).toMatchObject({ subject: 'Re: Order help' });
  });

  it('marks failed without retrying on a configuration error', async () => {
    sendMock.mockRejectedValueOnce(new EmailNotConfiguredError('no creds'));
    const { message, data } = await seed('pending');

    await expect(handleOutboundEmailJob(makeJob(data))).resolves.toBeUndefined();

    const after = await db.message.findUnique({ where: { id: message.id } });
    expect(after?.sendStatus).toBe('failed');
    expect(after?.sendError).toContain('no creds');
  });
});

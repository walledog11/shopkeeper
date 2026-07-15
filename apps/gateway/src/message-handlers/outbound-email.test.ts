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
const captureOutboundReplySent = vi.hoisted(() => vi.fn());

vi.mock('@shopkeeper/email', async (importActual) => {
  const actual = await importActual<typeof import('@shopkeeper/email')>();
  return { ...actual, getEmailSender: () => ({ send: sendMock }) };
});

vi.mock('../logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../product-analytics.js', () => ({
  captureOutboundReplySent,
}));

import { handleOutboundEmailJob } from './outbound-email.js';
import { createFailureInjector, InjectedPhaseFailure } from '@shopkeeper/agent/testing';

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
      integrationId: integration.id,
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
    captureOutboundReplySent.mockReset();
    captureOutboundReplySent.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await cleanupTestData(org?.id);
  });

  it('sends and marks the message sent', async () => {
    sendMock.mockResolvedValueOnce({ providerMessageId: 'provider-message-1' });
    const { message, data } = await seed('pending');

    await handleOutboundEmailJob(makeJob(data));

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock.mock.calls[0][0]).toMatchObject({
      to: 'customer@example.com',
      fromAddress: 'support@store.com',
      text: 'Hello there',
      headers: expect.arrayContaining([
        { name: 'Message-ID', value: expect.stringMatching(`^<message-${message.id}@`) },
      ]),
    });
    const after = await db.message.findUnique({ where: { id: message.id } });
    expect(after?.sendStatus).toBe('sent');
    expect(after?.providerMessageId).toBe('provider-message-1');
    expect(after?.sendClaimToken).toBeNull();
    expect(after?.sendClaimedAt).not.toBeNull();
    expect(after?.sendAttemptedAt).not.toBeNull();
    expect(after?.sendError).toBeNull();
    expect(captureOutboundReplySent).toHaveBeenCalledWith({
      channel: 'email',
      messageId: message.id,
      organizationId: org.id,
      replySource: 'agent_approved',
    });
  });

  it('skips a message that is already sent (idempotency)', async () => {
    const { message, data } = await seed('sent');

    await handleOutboundEmailJob(makeJob(data));

    expect(sendMock).not.toHaveBeenCalled();
    expect(captureOutboundReplySent).toHaveBeenCalledWith({
      channel: 'email',
      messageId: message.id,
      organizationId: org.id,
      replySource: 'agent_approved',
    });
    const after = await db.message.findUnique({ where: { id: message.id } });
    expect(after?.sendStatus).toBe('sent');
  });

  it('drops jobs whose message, thread, organization, and integration do not share ownership', async () => {
    sendMock.mockResolvedValue({ providerMessageId: 'provider-message-1' });
    const { message, data } = await seed('pending');
    const otherOrg = await createTestOrg();
    try {
      const otherIntegration = await createTestIntegration(otherOrg.id, {
        externalAccountId: 'other@store.com',
        accessToken: 'other-token',
        fromEmail: 'other@store.com',
      });

      await handleOutboundEmailJob(makeJob({ ...data, integrationId: otherIntegration.id }));
      await handleOutboundEmailJob(makeJob({ ...data, organizationId: otherOrg.id }));
      await handleOutboundEmailJob(makeJob({ ...data, threadId: crypto.randomUUID() }));

      expect(sendMock).not.toHaveBeenCalled();
      const unchanged = await db.message.findUniqueOrThrow({ where: { id: message.id } });
      expect(unchanged.sendStatus).toBe('pending');
      expect(unchanged.sendError).toBeNull();
    } finally {
      await cleanupTestData(otherOrg.id);
    }
  });

  it('allows exactly one concurrent worker to claim and send a pending message', async () => {
    sendMock.mockResolvedValue({ providerMessageId: 'provider-message-1' });
    const { data } = await seed('pending');

    await Promise.all(Array.from({ length: 6 }, () => handleOutboundEmailJob(makeJob(data))));

    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it('does not duplicate a send after provider acceptance and a pre-commit crash', async () => {
    sendMock.mockResolvedValue({ providerMessageId: 'provider-message-1' });
    const { message, data } = await seed('pending');
    const injector = createFailureInjector(['after-provider-accepted']);

    await expect(handleOutboundEmailJob(makeJob(data), {
      afterProviderAccepted: () => injector.checkpoint('after-provider-accepted'),
    })).rejects.toBeInstanceOf(InjectedPhaseFailure);

    const afterCrash = await db.message.findUnique({ where: { id: message.id } });
    expect(afterCrash?.sendStatus).toBe('processing');
    expect(afterCrash?.sendClaimToken).not.toBeNull();
    expect(afterCrash?.sendAttemptedAt).not.toBeNull();

    await handleOutboundEmailJob(makeJob(data, { attemptsMade: 1 }));
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it('marks a provider or transport failure unknown and suppresses automatic retry', async () => {
    sendMock.mockRejectedValueOnce(new Error('503 upstream'));
    const { message, data } = await seed('pending');

    await expect(handleOutboundEmailJob(makeJob(data))).resolves.toBeUndefined();

    const after = await db.message.findUnique({ where: { id: message.id } });
    expect(after?.sendStatus).toBe('unknown');
    expect(after?.sendClaimToken).toBeNull();
    expect(after?.sendError).toContain('503 upstream');
    expect(captureOutboundReplySent).not.toHaveBeenCalled();

    await handleOutboundEmailJob(makeJob(data, { attemptsMade: 1 }));
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it('sends an agent-initiated new-thread email with the subject verbatim (no Re:)', async () => {
    sendMock.mockResolvedValueOnce({ providerMessageId: 'provider-new-thread' });
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
        integrationId: integration.id,
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
    sendMock.mockResolvedValueOnce({ providerMessageId: 'provider-reply' });
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
        integrationId: integration.id,
      },
    });
    const message = await db.message.create({
      data: {
        threadId: thread.id,
        organizationId: org.id,
        senderType: SenderType.agent,
        contentText: 'reply',
        sendStatus: 'pending',
        integrationId: integration.id,
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

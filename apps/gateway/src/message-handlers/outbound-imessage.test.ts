import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ChannelType, SenderType, db } from '@shopkeeper/db';
import {
  createTestOrg,
  createTestIntegration,
  createTestCustomer,
  createTestThread,
  cleanupTestData,
} from '@shopkeeper/db/test-helpers';
import type { OutboundImessageJobData } from '../types.js';

const getAppMock = vi.fn();
const sendMock = vi.fn();
const spaceGetMock = vi.fn();
const spaceCreateMock = vi.fn();
const userMock = vi.fn();

vi.mock('spectrum-ts/providers/imessage', () => ({
  imessage: () => ({
    space: { get: spaceGetMock, create: spaceCreateMock },
    user: userMock,
  }),
}));

vi.mock('../clients/spectrum.js', async (importActual) => {
  const actual = await importActual<typeof import('../clients/spectrum.js')>();
  return { ...actual, getSpectrumAppForIntegration: (...args: unknown[]) => getAppMock(...args) };
});

vi.mock('../logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { handleOutboundImessageJob } from './outbound-imessage.js';
import { SpectrumIntegrationConfigError } from '../clients/spectrum.js';

type OutboundJob = Parameters<typeof handleOutboundImessageJob>[0];

function makeJob(
  data: OutboundImessageJobData,
  opts: { attempts?: number; attemptsMade?: number } = {},
): OutboundJob {
  return {
    data,
    opts: { attempts: opts.attempts ?? 3 },
    attemptsMade: opts.attemptsMade ?? 0,
  } as unknown as OutboundJob;
}

let org: Awaited<ReturnType<typeof createTestOrg>>;

async function seed(sendStatus: string, externalSpaceId: string | null = 'any;-;+15551234567') {
  const integration = await createTestIntegration(org.id, {
    platform: ChannelType.imessage,
    externalAccountId: 'proj_123',
    accessToken: 'secret',
  });
  const customer = await createTestCustomer(org.id, '+15551234567', { name: 'Cust' });
  const thread = await createTestThread(org.id, customer.id, ChannelType.imessage);
  if (externalSpaceId) {
    await db.thread.update({ where: { id: thread.id }, data: { externalSpaceId } });
  }
  const message = await db.message.create({
    data: {
      threadId: thread.id,
      organizationId: org.id,
      senderType: SenderType.agent,
      contentText: 'Hello there',
      sendStatus,
    },
  });
  const data: OutboundImessageJobData = {
    organizationId: org.id,
    messageId: message.id,
    threadId: thread.id,
    integrationId: integration.id,
    source: 'agent_send_reply',
  };
  return { integration, customer, thread, message, data };
}

describe('handleOutboundImessageJob', () => {
  beforeEach(async () => {
    org = await createTestOrg();
    getAppMock.mockReset();
    sendMock.mockReset();
    spaceGetMock.mockReset();
    spaceCreateMock.mockReset();
    userMock.mockReset();
    getAppMock.mockResolvedValue({});
  });

  afterEach(async () => {
    await cleanupTestData(org?.id);
  });

  it('reconstructs the space from externalSpaceId, sends, and marks the message sent', async () => {
    spaceGetMock.mockResolvedValueOnce({ send: sendMock });
    sendMock.mockResolvedValueOnce(undefined);
    const { message, data } = await seed('pending');

    await handleOutboundImessageJob(makeJob(data));

    expect(spaceGetMock).toHaveBeenCalledWith('any;-;+15551234567');
    expect(sendMock).toHaveBeenCalledWith('Hello there');
    const after = await db.message.findUnique({ where: { id: message.id } });
    expect(after?.sendStatus).toBe('sent');
    expect(after?.sendError).toBeNull();
  });

  it('refuses cold outbound and marks failed when no externalSpaceId is stored', async () => {
    const { message, data } = await seed('pending', null);

    await handleOutboundImessageJob(makeJob(data));

    // Inbound-first: no Space means the customer never messaged us — never
    // cold-start a conversation.
    expect(spaceGetMock).not.toHaveBeenCalled();
    expect(spaceCreateMock).not.toHaveBeenCalled();
    expect(userMock).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
    const after = await db.message.findUnique({ where: { id: message.id } });
    expect(after?.sendStatus).toBe('failed');
    expect(after?.sendError).toContain('No inbound iMessage conversation');
  });

  it('skips a message that is already sent (idempotency)', async () => {
    const { message, data } = await seed('sent');

    await handleOutboundImessageJob(makeJob(data));

    expect(sendMock).not.toHaveBeenCalled();
    const after = await db.message.findUnique({ where: { id: message.id } });
    expect(after?.sendStatus).toBe('sent');
  });

  it('rethrows and leaves the message pending on a non-final transient failure', async () => {
    spaceGetMock.mockResolvedValueOnce({ send: sendMock });
    sendMock.mockRejectedValueOnce(new Error('gRPC unavailable'));
    const { message, data } = await seed('pending');

    await expect(
      handleOutboundImessageJob(makeJob(data, { attemptsMade: 0, attempts: 3 })),
    ).rejects.toThrow('gRPC unavailable');

    const after = await db.message.findUnique({ where: { id: message.id } });
    expect(after?.sendStatus).toBe('pending');
    expect(after?.sendError).toBeNull();
  });

  it('marks the message failed and rethrows on the final transient failure', async () => {
    spaceGetMock.mockResolvedValueOnce({ send: sendMock });
    sendMock.mockRejectedValueOnce(new Error('gRPC unavailable'));
    const { message, data } = await seed('pending');

    await expect(
      handleOutboundImessageJob(makeJob(data, { attemptsMade: 2, attempts: 3 })),
    ).rejects.toThrow('gRPC unavailable');

    const after = await db.message.findUnique({ where: { id: message.id } });
    expect(after?.sendStatus).toBe('failed');
    expect(after?.sendError).toContain('gRPC unavailable');
  });

  it('marks failed without retrying on a Spectrum configuration error', async () => {
    getAppMock.mockReset();
    getAppMock.mockRejectedValueOnce(new SpectrumIntegrationConfigError('missing creds'));
    const { message, data } = await seed('pending');

    await expect(handleOutboundImessageJob(makeJob(data))).resolves.toBeUndefined();

    expect(sendMock).not.toHaveBeenCalled();
    const after = await db.message.findUnique({ where: { id: message.id } });
    expect(after?.sendStatus).toBe('failed');
    expect(after?.sendError).toContain('missing creds');
  });
});

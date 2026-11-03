import { DelayedError } from 'bullmq';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { redis, listOperatorBindings, notifyOperator } = vi.hoisted(() => ({
  redis: { set: vi.fn(), del: vi.fn() },
  listOperatorBindings: vi.fn(),
  notifyOperator: vi.fn(),
}));
vi.mock('../../clients/redis-client.js', () => ({ getGatewayRedis: () => redis }));
vi.mock('../../operator-notify.js', () => ({ listOperatorBindings, notifyOperator }));

import {
  MODEL_OUTAGE_NOTICE,
  MODEL_RECOVERED_NOTICE,
  noteModelRecovered,
  waitOutModelOutage,
} from './model-outage.js';

const NOW = Date.parse('2026-11-02T22:18:24Z');
const refusal = Object.assign(new Error('refused'), { status: 400 });

function heldJob(modelOutageSince?: number) {
  return {
    data: {
      threadId: 'thread_1', organizationId: 'org_1', sourceMessageId: 'message_1',
      customerName: null, channelType: 'ig_dm' as const,
      ...(modelOutageSince === undefined ? {} : { modelOutageSince }),
    },
    updateData: vi.fn().mockResolvedValue(undefined),
    moveToDelayed: vi.fn().mockResolvedValue(undefined),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  listOperatorBindings.mockResolvedValue([{ channel: 'imessage', orgMemberId: 'm1', senderId: 's1', spaceId: 'sp1' }]);
  notifyOperator.mockResolvedValue({ channel: 'imessage', chatId: 's1' });
});

// Live run 2026-11-02: with the API account out of credit, a customer message
// spent its attempts in seconds and was dropped, and nobody was told.
describe('a customer message the model provider refuses', () => {
  it('is held for a retry and the merchant is told once', async () => {
    redis.set.mockResolvedValueOnce('OK');
    const job = heldJob();

    await expect(waitOutModelOutage(job, 'token', refusal, NOW)).rejects.toBeInstanceOf(DelayedError);

    expect(job.moveToDelayed).toHaveBeenCalledWith(NOW + 2 * 60_000, 'token');
    expect(job.updateData).toHaveBeenCalledWith(expect.objectContaining({ modelOutageSince: NOW }));
    expect(notifyOperator).toHaveBeenCalledOnce();
    expect(notifyOperator.mock.calls[0]?.[2]).toBe(MODEL_OUTAGE_NOTICE);
  });

  it('is held again without telling the merchant twice', async () => {
    redis.set.mockResolvedValueOnce(null);
    const job = heldJob(NOW - 10 * 60_000);

    await expect(waitOutModelOutage(job, 'token', refusal, NOW)).rejects.toBeInstanceOf(DelayedError);

    expect(job.moveToDelayed).toHaveBeenCalledOnce();
    expect(job.updateData).not.toHaveBeenCalled();
    expect(notifyOperator).not.toHaveBeenCalled();
  });

  it('fails as any job would once it has waited a day', async () => {
    const job = heldJob(NOW - 24 * 60 * 60_000);

    await expect(waitOutModelOutage(job, 'token', refusal, NOW)).rejects.toBe(refusal);

    expect(job.moveToDelayed).not.toHaveBeenCalled();
  });

  it('tells the merchant when it is handled again, once', async () => {
    redis.del.mockResolvedValueOnce(1).mockResolvedValueOnce(0);

    await noteModelRecovered('org_1');
    await noteModelRecovered('org_1');

    expect(notifyOperator).toHaveBeenCalledOnce();
    expect(notifyOperator.mock.calls[0]?.[2]).toBe(MODEL_RECOVERED_NOTICE);
  });
});

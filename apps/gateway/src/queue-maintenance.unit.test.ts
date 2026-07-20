import { beforeEach, describe, expect, it, vi } from 'vitest';

const getJob = vi.fn();

vi.mock('./clients/gateway-queues.js', () => ({
  getGatewayBullMqQueue: vi.fn(() => ({ getJob })),
  resolveGatewayQueueName: vi.fn((name: string) => name.trim()),
}));

import { removeFailedQueueJob } from './queue-maintenance.js';

beforeEach(() => {
  getJob.mockReset();
});

describe('removeFailedQueueJob', () => {
  it('returns false when the job no longer exists', async () => {
    getJob.mockResolvedValue(null);

    await expect(removeFailedQueueJob('ai-summary', 'missing')).resolves.toBe(false);
  });

  it.each(['waiting', 'active', 'completed', 'delayed'])(
    'refuses to remove a %s job',
    async (state) => {
      const remove = vi.fn();
      getJob.mockResolvedValue({ getState: vi.fn().mockResolvedValue(state), remove });

      await expect(removeFailedQueueJob('ai-summary', 'job-1')).resolves.toBe(false);
      expect(remove).not.toHaveBeenCalled();
    },
  );

  it('removes one exact failed job', async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    getJob.mockResolvedValue({ getState: vi.fn().mockResolvedValue('failed'), remove });

    await expect(removeFailedQueueJob('ai-summary', 'job-1')).resolves.toBe(true);
    expect(remove).toHaveBeenCalledOnce();
  });
});

import type { Queue } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';
import { PROCESSING_QUEUE_DEFAULTS } from '../constants.js';
import { scheduleRepeatableJob } from './registration.js';

describe('scheduleRepeatableJob', () => {
  it('removes stale intervals for the same job before registering the current schedule', async () => {
    const queue = {
      getRepeatableJobs: vi.fn().mockResolvedValue([
        { name: 'digest', every: '60000', key: 'digest:stale' },
        { name: 'digest', every: '300000', key: 'digest:current' },
        { name: 'other-job', every: '60000', key: 'other:stale' },
      ]),
      removeRepeatableByKey: vi.fn().mockResolvedValue(undefined),
      add: vi.fn().mockResolvedValue({ id: 'digest-job' }),
    } as unknown as Queue;

    await scheduleRepeatableJob(queue, 'digest', 'digest-scheduled', 300_000);

    expect(queue.removeRepeatableByKey).toHaveBeenCalledTimes(1);
    expect(queue.removeRepeatableByKey).toHaveBeenCalledWith('digest:stale');
    expect(queue.add).toHaveBeenCalledWith('digest', {}, {
      repeat: { every: 300_000 },
      jobId: 'digest-scheduled',
      ...PROCESSING_QUEUE_DEFAULTS,
    });
  });
});

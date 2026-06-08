import { describe, expect, it, vi } from 'vitest';
import { readFailedQueueJobSnapshots } from './health.js';

describe('readFailedQueueJobSnapshots', () => {
  it('returns an empty array when there are no failed jobs', async () => {
    const queue = {
      getJobs: vi.fn(),
    };

    await expect(readFailedQueueJobSnapshots(queue, 0)).resolves.toEqual([]);
    expect(queue.getJobs).not.toHaveBeenCalled();
  });

  it('maps failed job metadata for queue diagnostics', async () => {
    const queue = {
      getJobs: vi.fn().mockResolvedValue([
        {
          id: '42',
          name: 'summarize-thread',
          failedReason: 'fetch failed',
          attemptsMade: 3,
          finishedOn: 1_700_000_000_000,
          data: {
            threadId: 'thread-1',
            organizationId: 'org-1',
            traceId: 'trace-1',
          },
        },
      ]),
    };

    await expect(readFailedQueueJobSnapshots(queue, 1)).resolves.toEqual([
      {
        id: '42',
        name: 'summarize-thread',
        failedReason: 'fetch failed',
        attemptsMade: 3,
        finishedOn: '2023-11-14T22:13:20.000Z',
        threadId: 'thread-1',
        organizationId: 'org-1',
        traceId: 'trace-1',
      },
    ]);

    expect(queue.getJobs).toHaveBeenCalledWith(['failed'], 0, 0, false);
  });
});

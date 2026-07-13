import { describe, expect, it, vi } from 'vitest';
import type { Queue } from 'bullmq';
import type { AiSummaryJobData } from '../types.js';
import { enqueueAiSummaryJob } from './inbound-persistence.js';

describe('enqueueAiSummaryJob', () => {
  it('debounces by thread and replaces the delayed payload with the newest source message', async () => {
    const add = vi.fn().mockResolvedValue({ id: 'job_1' });
    const queue = { add } as unknown as Pick<Queue<AiSummaryJobData>, 'add'>;
    const data: AiSummaryJobData = {
      threadId: 'thread_1',
      organizationId: 'org_1',
      sourceMessageId: 'message_new',
      customerName: 'Jane',
      channelType: 'email',
    };

    await enqueueAiSummaryJob(queue, data);

    expect(add).toHaveBeenCalledWith('summarize-thread', data, {
      delay: 300,
      deduplication: {
        id: 'thread:thread_1',
        ttl: 300,
        extend: true,
        replace: true,
      },
    });
  });
});

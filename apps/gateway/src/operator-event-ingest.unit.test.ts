import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JOB, QUEUE } from './constants.js';

const queueAdd = vi.fn();
const queueGetJob = vi.fn();
const getState = vi.fn();

vi.mock('./clients/gateway-queues.js', () => ({
  getGatewayBullMqQueue: () => ({
    add: (...args: unknown[]) => queueAdd(...args),
    getJob: (...args: unknown[]) => queueGetJob(...args),
  }),
}));

vi.mock('./operator-event-store.js', () => ({
  ingestOperatorEvent: vi.fn(),
}));

import { ensureOperatorEventEnqueued, ingestAndEnqueueOperatorEvent } from './operator-event-ingest.js';
import { ingestOperatorEvent } from './operator-event-store.js';

describe('ensureOperatorEventEnqueued', () => {
  beforeEach(() => {
    queueAdd.mockReset();
    queueGetJob.mockReset();
    getState.mockReset();
    queueAdd.mockResolvedValue({ id: 'job-1' });
  });

  it('enqueues a new job when none exists', async () => {
    queueGetJob.mockResolvedValue(null);

    await ensureOperatorEventEnqueued({ id: 'event-1', organizationId: 'org-1' });

    expect(queueAdd).toHaveBeenCalledWith(
      JOB.OPERATOR_EVENT,
      { operatorEventId: 'event-1', organizationId: 'org-1' },
      { jobId: 'event-1' },
    );
  });

  it('replaces a failed job so a stranded pending event can be retried', async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    queueGetJob.mockResolvedValue({ getState, remove });
    getState.mockResolvedValue('failed');

    await ensureOperatorEventEnqueued({ id: 'event-2b', organizationId: 'org-2b' });

    expect(remove).toHaveBeenCalled();
    expect(queueAdd).toHaveBeenCalled();
  });

  it('replaces a terminal job so a stranded pending event can be retried', async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    queueGetJob.mockResolvedValue({ getState, remove });
    getState.mockResolvedValue('completed');

    await ensureOperatorEventEnqueued({ id: 'event-2', organizationId: 'org-2' });

    expect(remove).toHaveBeenCalled();
    expect(queueAdd).toHaveBeenCalledWith(
      JOB.OPERATOR_EVENT,
      { operatorEventId: 'event-2', organizationId: 'org-2' },
      { jobId: 'event-2' },
    );
  });

  it('leaves a live job alone', async () => {
    queueGetJob.mockResolvedValue({ getState, remove: vi.fn() });
    getState.mockResolvedValue('waiting');

    await ensureOperatorEventEnqueued({ id: 'event-3', organizationId: 'org-3' });

    expect(queueAdd).not.toHaveBeenCalled();
  });
});

describe('ingestAndEnqueueOperatorEvent', () => {
  beforeEach(() => {
    queueAdd.mockReset();
    queueGetJob.mockReset();
    getState.mockReset();
    queueAdd.mockResolvedValue({ id: 'job-1' });
    queueGetJob.mockResolvedValue(null);
    vi.mocked(ingestOperatorEvent).mockReset();
  });

  it('persists then enqueues through the shared ingestion path', async () => {
    vi.mocked(ingestOperatorEvent).mockResolvedValue({
      created: true,
      event: { id: 'event-4', organizationId: 'org-4' },
    });

    const result = await ingestAndEnqueueOperatorEvent({
      organizationId: 'org-4',
      channel: 'telegram',
      providerMessageId: 'telegram:1:2',
      chatId: '123',
      clerkUserId: 'usr_1',
      operatorKey: 'usr_1',
      body: 'refund please',
    });

    expect(result.created).toBe(true);
    expect(queueAdd).toHaveBeenCalledWith(
      JOB.OPERATOR_EVENT,
      { operatorEventId: 'event-4', organizationId: 'org-4' },
      { jobId: 'event-4' },
    );
  });
});

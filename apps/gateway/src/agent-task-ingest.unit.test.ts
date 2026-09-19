import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JOB } from './constants.js';

const add = vi.fn();
const getJob = vi.fn();

vi.mock('./clients/gateway-queues.js', () => ({
  getGatewayBullMqQueue: () => ({ add, getJob }),
}));

import { ensureAgentTaskEnqueued } from './agent-task-ingest.js';

describe('ensureAgentTaskEnqueued', () => {
  beforeEach(() => {
    add.mockReset().mockResolvedValue({ id: 'task-1' });
    getJob.mockReset();
  });

  it('publishes only durable identity and revision with the task id as job id', async () => {
    getJob.mockResolvedValue(null);
    await ensureAgentTaskEnqueued({ id: 'task-1', organizationId: 'org-1', revision: 3 });
    expect(add).toHaveBeenCalledWith(
      JOB.AGENT_TASK,
      { taskId: 'task-1', organizationId: 'org-1', revision: 3 },
      { jobId: 'task-1' },
    );
  });

  it('leaves a live redelivery alone', async () => {
    getJob.mockResolvedValue({ getState: vi.fn().mockResolvedValue('active'), remove: vi.fn() });
    await ensureAgentTaskEnqueued({ id: 'task-1', organizationId: 'org-1', revision: 0 });
    expect(add).not.toHaveBeenCalled();
  });

  it('replaces a terminal job so a persisted queue gap can heal', async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    getJob.mockResolvedValue({ getState: vi.fn().mockResolvedValue('completed'), remove });
    await ensureAgentTaskEnqueued({ id: 'task-1', organizationId: 'org-1', revision: 0 });
    expect(remove).toHaveBeenCalledOnce();
    expect(add).toHaveBeenCalledOnce();
  });
});

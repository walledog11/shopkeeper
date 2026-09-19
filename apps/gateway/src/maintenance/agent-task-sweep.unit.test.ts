import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findQueued, reconcileExpired, enqueue } = vi.hoisted(() => ({
  findQueued: vi.fn(),
  reconcileExpired: vi.fn(),
  enqueue: vi.fn(),
}));

vi.mock('@shopkeeper/agent/task-ledger', () => ({
  findQueuedAgentTasks: findQueued,
  reconcileExpiredAgentTaskClaims: reconcileExpired,
}));
vi.mock('../agent-task-ingest.js', () => ({ ensureAgentTaskEnqueued: enqueue }));
vi.mock('../logger.js', () => ({ default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

import { runAgentTaskSweep } from './agent-task-sweep.js';

describe('runAgentTaskSweep', () => {
  beforeEach(() => {
    findQueued.mockReset();
    reconcileExpired.mockReset().mockResolvedValue(0);
    enqueue.mockReset().mockResolvedValue(undefined);
  });

  it('re-enqueues persisted queued work after a commit-to-publication crash', async () => {
    const task = { id: 'task-1', organizationId: 'org-1', revision: 0 };
    findQueued.mockResolvedValue([task]);
    await runAgentTaskSweep();
    expect(enqueue).toHaveBeenCalledWith(task);
  });

  it('reconciles expired attempts before scheduling queued work', async () => {
    findQueued.mockResolvedValue([]);
    reconcileExpired.mockResolvedValue(1);
    await runAgentTaskSweep();
    expect(reconcileExpired.mock.invocationCallOrder[0]).toBeLessThan(findQueued.mock.invocationCallOrder[0]);
  });
});

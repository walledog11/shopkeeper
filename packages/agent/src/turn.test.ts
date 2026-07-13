import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictError, ServiceUnavailableError } from './errors.js';
import { NOOP_LOCK } from './lock/redis-lock.js';
import { executeAgentTurn } from './turn.js';
import { createDeterministicBarrier } from './testing/failure-harness.js';

describe('executeAgentTurn lock policy', () => {
  const deps = {
    lock: {
      acquire: vi.fn(),
    },
    buildContext: vi.fn(),
    runAgent: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requests fail-closed locking for mutating turns', async () => {
    deps.lock.acquire.mockResolvedValueOnce(NOOP_LOCK);
    deps.buildContext.mockResolvedValueOnce({ orgId: 'org_1' });
    deps.runAgent.mockResolvedValueOnce({ summary: 'done', actionsPerformed: [] });

    await executeAgentTurn({
      orgId: 'org_1',
      threadId: 'thread_1',
      instruction: 'Refund the order',
      auditMode: 'human_approved',
      persistAuditNote: false,
    }, deps as never);

    expect(deps.lock.acquire).toHaveBeenCalledWith('thread_1', { failClosed: true });
  });

  it('requests fail-open locking for read-only turns', async () => {
    deps.lock.acquire.mockResolvedValueOnce(NOOP_LOCK);
    deps.buildContext.mockResolvedValueOnce({ orgId: 'org_1' });
    deps.runAgent.mockResolvedValueOnce({ summary: 'done', actionsPerformed: [] });

    await executeAgentTurn({
      orgId: 'org_1',
      threadId: 'thread_1',
      instruction: 'Summarize this ticket',
      auditMode: 'read_only',
      persistAuditNote: false,
    }, deps as never);

    expect(deps.lock.acquire).toHaveBeenCalledWith('thread_1', { failClosed: false });
  });

  it('surfaces lock unavailability as a service error for mutating turns', async () => {
    deps.lock.acquire.mockRejectedValueOnce(new ServiceUnavailableError());

    await expect(executeAgentTurn({
      orgId: 'org_1',
      threadId: 'thread_1',
      instruction: 'Cancel the order',
    }, deps as never)).rejects.toBeInstanceOf(ServiceUnavailableError);
  });

  it('surfaces an active lock as a conflict', async () => {
    deps.lock.acquire.mockResolvedValueOnce(null);

    await expect(executeAgentTurn({
      orgId: 'org_1',
      threadId: 'thread_1',
      instruction: 'Cancel the order',
    }, deps as never)).rejects.toBeInstanceOf(ConflictError);
  });

  it('reproduces duplicate execution when two runtimes use independent lock authorities', async () => {
    const barrier = createDeterministicBarrier(2);
    let externalMutations = 0;
    const makeIndependentDeps = () => ({
      lock: { acquire: vi.fn(async () => NOOP_LOCK) },
      buildContext: vi.fn(async () => ({ orgId: 'org_1' })),
      runAgent: vi.fn(async () => {
        externalMutations += 1;
        await barrier.arrive();
        return { summary: 'done', actionsPerformed: [] };
      }),
    });

    const first = executeAgentTurn({
      orgId: 'org_1',
      threadId: 'thread_1',
      instruction: 'Refund the order',
      persistAuditNote: false,
    }, makeIndependentDeps() as never);
    const second = executeAgentTurn({
      orgId: 'org_1',
      threadId: 'thread_1',
      instruction: 'Refund the order',
      persistAuditNote: false,
    }, makeIndependentDeps() as never);

    await barrier.waitForArrivals();
    expect(externalMutations).toBe(2);
    barrier.release();
    await Promise.all([first, second]);
  });
});

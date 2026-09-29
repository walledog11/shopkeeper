import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Queue } from 'bullmq';
import type { IntegrationDisconnectJobData } from '../types.js';

const { listRecoverableIntegrationDisconnects } = vi.hoisted(() => ({
  listRecoverableIntegrationDisconnects: vi.fn(),
}));

vi.mock('@shopkeeper/db', () => ({ listRecoverableIntegrationDisconnects }));
vi.mock('../logger.js', () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { enqueueRecoverableIntegrationDisconnects } from './integration-disconnect-sweep.js';

const add = vi.fn();
const getJob = vi.fn();
const queue = { add, getJob } as unknown as Queue<IntegrationDisconnectJobData>;

beforeEach(() => {
  vi.clearAllMocks();
  add.mockResolvedValue({ id: 'job' });
});

describe('enqueueRecoverableIntegrationDisconnects', () => {
  it('re-enqueues pending operations with stable job ids', async () => {
    listRecoverableIntegrationDisconnects.mockResolvedValue([
      { id: 'disconnect_1', organizationId: 'organization_1' },
    ]);
    getJob.mockResolvedValue(null);

    await expect(enqueueRecoverableIntegrationDisconnects(queue)).resolves.toBe(1);
    expect(add).toHaveBeenCalledWith(
      'process-integration-disconnect',
      { operationId: 'disconnect_1', organizationId: 'organization_1' },
      { jobId: 'disconnect_1' },
    );
  });

  it('leaves a live job alone', async () => {
    listRecoverableIntegrationDisconnects.mockResolvedValue([
      { id: 'disconnect_1', organizationId: 'organization_1' },
    ]);
    getJob.mockResolvedValue({
      getState: vi.fn().mockResolvedValue('active'),
      remove: vi.fn(),
    });

    await expect(enqueueRecoverableIntegrationDisconnects(queue)).resolves.toBe(0);
    expect(add).not.toHaveBeenCalled();
  });

  it.each(['completed', 'failed'])('replaces a retained %s job', async (state) => {
    const remove = vi.fn().mockResolvedValue(undefined);
    listRecoverableIntegrationDisconnects.mockResolvedValue([
      { id: 'disconnect_1', organizationId: 'organization_1' },
    ]);
    getJob.mockResolvedValue({
      getState: vi.fn().mockResolvedValue(state),
      remove,
    });

    await expect(enqueueRecoverableIntegrationDisconnects(queue)).resolves.toBe(1);
    expect(remove).toHaveBeenCalledOnce();
    expect(add).toHaveBeenCalledOnce();
  });
});

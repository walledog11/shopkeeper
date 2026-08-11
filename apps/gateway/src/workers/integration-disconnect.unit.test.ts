import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Job } from 'bullmq';
import type { IntegrationDisconnectJobData } from '../types.js';

const {
  claimIntegrationDisconnect,
  completeIntegrationDisconnect,
  failIntegrationDisconnect,
  markIntegrationProviderCleaned,
  postDashboardInternal,
  releaseIntegrationDisconnect,
} = vi.hoisted(() => ({
  claimIntegrationDisconnect: vi.fn(),
  completeIntegrationDisconnect: vi.fn(),
  failIntegrationDisconnect: vi.fn(),
  markIntegrationProviderCleaned: vi.fn(),
  postDashboardInternal: vi.fn(),
  releaseIntegrationDisconnect: vi.fn(),
}));

vi.mock('@shopkeeper/db', () => ({
  claimIntegrationDisconnect,
  completeIntegrationDisconnect,
  failIntegrationDisconnect,
  markIntegrationProviderCleaned,
  releaseIntegrationDisconnect,
}));

vi.mock('../clients/dashboard-internal.js', () => ({
  postDashboardInternal,
}));

vi.mock('../logger.js', () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { processIntegrationDisconnect } from './integration-disconnect.js';

const operation = {
  id: 'disconnect_1',
  integrationId: 'integration_1',
  organizationId: 'organization_1',
};

beforeEach(() => {
  vi.clearAllMocks();
  claimIntegrationDisconnect.mockResolvedValue({
    claimToken: 'claim_1',
    operation,
  });
  postDashboardInternal.mockResolvedValue({ ok: true, data: { cleaned: true } });
  markIntegrationProviderCleaned.mockResolvedValue(true);
  completeIntegrationDisconnect.mockResolvedValue(true);
  releaseIntegrationDisconnect.mockResolvedValue(true);
  failIntegrationDisconnect.mockResolvedValue(true);
});

describe('processIntegrationDisconnect', () => {
  it('claims, cleans, records, and completes in order', async () => {
    await processIntegrationDisconnect(job());

    expect(claimIntegrationDisconnect).toHaveBeenCalledWith('disconnect_1');
    expect(postDashboardInternal).toHaveBeenCalledWith(
      '/api/integrations/internal/disconnect-cleanup',
      { operationId: 'disconnect_1', claimToken: 'claim_1' },
      { requestId: 'disconnect_1' },
    );
    expect(markIntegrationProviderCleaned).toHaveBeenCalledWith('disconnect_1', 'claim_1');
    expect(completeIntegrationDisconnect).toHaveBeenCalledWith('disconnect_1', 'claim_1');
    expect(markIntegrationProviderCleaned.mock.invocationCallOrder[0])
      .toBeLessThan(completeIntegrationDisconnect.mock.invocationCallOrder[0]);
  });

  it('releases a transient failure so BullMQ can retry it', async () => {
    postDashboardInternal.mockResolvedValueOnce({
      ok: false,
      status: null,
      responseBody: 'timeout',
      outcome: 'unknown',
    });

    await expect(processIntegrationDisconnect(job({ attemptsMade: 0, attempts: 3 })))
      .rejects.toThrow('Dashboard cleanup unknown');

    expect(releaseIntegrationDisconnect).toHaveBeenCalledWith(
      'disconnect_1',
      'claim_1',
      expect.any(Error),
    );
    expect(failIntegrationDisconnect).not.toHaveBeenCalled();
  });

  it('records a terminal failure after the final BullMQ attempt', async () => {
    postDashboardInternal.mockResolvedValueOnce({
      ok: false,
      status: 503,
      responseBody: 'unavailable',
      outcome: 'failed',
    });

    await expect(processIntegrationDisconnect(job({ attemptsMade: 2, attempts: 3 })))
      .rejects.toThrow('Dashboard cleanup failed');

    expect(failIntegrationDisconnect).toHaveBeenCalledWith(
      'disconnect_1',
      'claim_1',
      expect.any(Error),
    );
    expect(releaseIntegrationDisconnect).not.toHaveBeenCalled();
  });

  it('does nothing when another worker owns or completed the operation', async () => {
    claimIntegrationDisconnect.mockResolvedValueOnce(null);

    await processIntegrationDisconnect(job());

    expect(postDashboardInternal).not.toHaveBeenCalled();
    expect(markIntegrationProviderCleaned).not.toHaveBeenCalled();
    expect(completeIntegrationDisconnect).not.toHaveBeenCalled();
  });
});

function job(options: { attemptsMade?: number; attempts?: number } = {}) {
  return {
    attemptsMade: options.attemptsMade ?? 0,
    data: {
      operationId: operation.id,
      organizationId: operation.organizationId,
    },
    opts: { attempts: options.attempts ?? 3 },
  } as Job<IntegrationDisconnectJobData>;
}

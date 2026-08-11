import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { cleanupIntegrationProvider, findIntegration, findOperation } = vi.hoisted(() => ({
  cleanupIntegrationProvider: vi.fn(),
  findIntegration: vi.fn(),
  findOperation: vi.fn(),
}));

vi.mock('@shopkeeper/db', () => ({
  db: {
    integration: { findFirst: findIntegration },
    integrationDisconnect: { findUnique: findOperation },
  },
  isSpendCapError: () => false,
}));

vi.mock('@/app/api/integrations/_lib/provider-cleanup', () => ({
  cleanupIntegrationProvider,
}));

import { POST } from './route';

beforeEach(() => {
  vi.stubEnv('INTERNAL_API_SECRET', 'test-internal-secret');
  cleanupIntegrationProvider.mockResolvedValue(undefined);
  findOperation.mockResolvedValue({
    id: 'disconnect_1',
    integrationId: 'integration_1',
    organizationId: 'organization_1',
    status: 'processing',
    claimToken: 'claim_1',
    providerCleanedAt: null,
  });
  findIntegration.mockResolvedValue({
    id: 'integration_1',
    organizationId: 'organization_1',
    lifecycleStatus: 'disconnecting',
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('POST /api/integrations/internal/disconnect-cleanup', () => {
  it('rejects unauthenticated provider cleanup', async () => {
    const response = await POST(request(null));

    expect(response.status).toBe(401);
    expect(findOperation).not.toHaveBeenCalled();
  });

  it('requires the currently active durable claim', async () => {
    const response = await POST(request('test-internal-secret', {
      operationId: 'disconnect_1',
      claimToken: 'stale_claim',
    }));

    expect(response.status).toBe(409);
    expect(cleanupIntegrationProvider).not.toHaveBeenCalled();
  });

  it('cleans only the disconnecting integration owned by the claimed operation', async () => {
    const response = await POST(request('test-internal-secret'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ cleaned: true });
    expect(findIntegration).toHaveBeenCalledWith({
      where: {
        id: 'integration_1',
        organizationId: 'organization_1',
        lifecycleStatus: { in: ['disconnecting', 'cleanup_failed'] },
      },
    });
    expect(cleanupIntegrationProvider).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'integration_1' }),
    );
  });

  it('does not repeat provider work already committed to the ledger', async () => {
    findOperation.mockResolvedValueOnce({
      id: 'disconnect_1',
      integrationId: 'integration_1',
      organizationId: 'organization_1',
      status: 'processing',
      claimToken: 'claim_1',
      providerCleanedAt: new Date(),
    });

    const response = await POST(request('test-internal-secret'));

    expect(response.status).toBe(200);
    expect(findIntegration).not.toHaveBeenCalled();
    expect(cleanupIntegrationProvider).not.toHaveBeenCalled();
  });

  it('does not claim success when provider credentials disappeared before cleanup', async () => {
    findIntegration.mockResolvedValueOnce(null);

    const response = await POST(request('test-internal-secret'));

    expect(response.status).toBe(409);
    expect(cleanupIntegrationProvider).not.toHaveBeenCalled();
  });
});

function request(
  secret: string | null = 'test-internal-secret',
  body: Record<string, string> = {
    operationId: 'disconnect_1',
    claimToken: 'claim_1',
  },
) {
  return new Request('http://localhost/api/integrations/internal/disconnect-cleanup', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(secret ? { 'x-internal-secret': secret } : {}),
    },
    body: JSON.stringify(body),
  });
}

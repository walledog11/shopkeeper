import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchProviderWithDeadline, getGatewayBaseUrl } = vi.hoisted(() => ({
  fetchProviderWithDeadline: vi.fn(),
  getGatewayBaseUrl: vi.fn(),
}));

vi.mock('@/lib/server/gateway-url', () => ({ getGatewayBaseUrl }));
vi.mock('@/lib/server/provider-fetch', () => ({
  fetchProviderWithDeadline,
  isProviderRequestTimeoutError: () => false,
}));
vi.mock('@/lib/server/logger', () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { enqueueIntegrationDisconnect } from './enqueue-integration-disconnect';

beforeEach(() => {
  vi.stubEnv('INTERNAL_API_SECRET', 'internal-secret');
  getGatewayBaseUrl.mockReturnValue('http://gateway.test');
  fetchProviderWithDeadline.mockResolvedValue(new Response(null, { status: 202 }));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('enqueueIntegrationDisconnect', () => {
  it('authenticates and submits the durable operation to the gateway', async () => {
    await expect(enqueueIntegrationDisconnect({
      operationId: 'disconnect_1',
      organizationId: 'organization_1',
    })).resolves.toBe('enqueued');

    expect(fetchProviderWithDeadline).toHaveBeenCalledWith(
      'http://gateway.test/internal/queue/integration-disconnect',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': 'internal-secret',
        },
        body: JSON.stringify({
          operationId: 'disconnect_1',
          organizationId: 'organization_1',
        }),
      }),
      { provider: 'gateway', operation: 'integration-disconnect queue admission' },
    );
  });

  it('reports a definite rejection without losing the durable operation', async () => {
    fetchProviderWithDeadline.mockResolvedValueOnce(new Response('unavailable', { status: 503 }));

    await expect(enqueueIntegrationDisconnect({
      operationId: 'disconnect_1',
      organizationId: 'organization_1',
    })).resolves.toBe('failed');
  });

  it('reports an unknown transport outcome for recovery by the sweep', async () => {
    fetchProviderWithDeadline.mockRejectedValueOnce(new Error('connection reset'));

    await expect(enqueueIntegrationDisconnect({
      operationId: 'disconnect_1',
      organizationId: 'organization_1',
    })).resolves.toBe('unknown');
  });

  it('contains invalid gateway configuration after the database commit', async () => {
    getGatewayBaseUrl.mockImplementationOnce(() => {
      throw new Error('invalid gateway URL');
    });

    await expect(enqueueIntegrationDisconnect({
      operationId: 'disconnect_1',
      organizationId: 'organization_1',
    })).resolves.toBe('failed');
    expect(fetchProviderWithDeadline).not.toHaveBeenCalled();
  });
});

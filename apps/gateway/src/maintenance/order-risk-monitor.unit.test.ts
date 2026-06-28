import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  findMany,
  isEnabled,
  listOrderIds,
  logger,
} = vi.hoisted(() => ({
  findMany: vi.fn(),
  isEnabled: vi.fn(),
  listOrderIds: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@shopkeeper/db', () => ({
  db: { integration: { findMany } },
}));
vi.mock('@shopkeeper/agent/shopify', () => ({
  listRecentUnfulfilledOrderIds: listOrderIds,
  ShopifyRequestError: class ShopifyRequestError extends Error {
    status?: number;
    constructor(message: string, options: { status?: number } = {}) {
      super(message);
      this.status = options.status;
    }
  },
}));
vi.mock('../config/runtime-config.js', () => ({
  isOrderRiskMonitorEnabled: isEnabled,
}));
vi.mock('../logger.js', () => ({ default: logger }));
vi.mock('./registration.js', () => ({
  createMaintenanceQueue: vi.fn(),
  createMaintenanceWorker: vi.fn(),
  scheduleRepeatableJob: vi.fn(),
  ONE_HOUR_MS: 3_600_000,
}));

import { runOrderRiskMonitor } from './order-risk-monitor.js';

describe('runOrderRiskMonitor', () => {
  beforeEach(() => {
    findMany.mockReset();
    isEnabled.mockReset();
    listOrderIds.mockReset();
    logger.warn.mockReset();
  });

  it('does no I/O when disabled', async () => {
    isEnabled.mockReturnValue(false);
    const queue = { add: vi.fn() };

    await expect(runOrderRiskMonitor(queue as never)).resolves.toEqual({
      orgsScanned: 0,
      ordersReviewed: 0,
    });
    expect(findMany).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('scans multiple organizations, skips invalid integrations, and uses stable job ids', async () => {
    isEnabled.mockReturnValue(true);
    findMany.mockResolvedValue([
      { organizationId: 'org-a', externalAccountId: 'a.myshopify.com', accessToken: 'token-a' },
      { organizationId: 'org-b', externalAccountId: 'b.myshopify.com', accessToken: 'token-b' },
      { organizationId: 'org-invalid', externalAccountId: '', accessToken: 'token' },
    ]);
    listOrderIds
      .mockResolvedValueOnce(['100', '101'])
      .mockResolvedValueOnce(['200']);
    const queue = { add: vi.fn().mockResolvedValue({ id: 'job' }) };

    await expect(runOrderRiskMonitor(queue as never)).resolves.toEqual({
      orgsScanned: 3,
      ordersReviewed: 3,
    });
    expect(queue.add.mock.calls).toEqual([
      ['process-order-review', { organizationId: 'org-a', orderId: '100' }, { jobId: 'order-review:a.myshopify.com:100' }],
      ['process-order-review', { organizationId: 'org-a', orderId: '101' }, { jobId: 'order-review:a.myshopify.com:101' }],
      ['process-order-review', { organizationId: 'org-b', orderId: '200' }, { jobId: 'order-review:b.myshopify.com:200' }],
    ]);
  });

  it('isolates provider failures to the affected organization', async () => {
    isEnabled.mockReturnValue(true);
    findMany.mockResolvedValue([
      { organizationId: 'org-a', externalAccountId: 'a.myshopify.com', accessToken: 'token-a' },
      { organizationId: 'org-b', externalAccountId: 'b.myshopify.com', accessToken: 'token-b' },
    ]);
    listOrderIds
      .mockRejectedValueOnce(new Error('Shopify unavailable'))
      .mockResolvedValueOnce(['200']);
    const queue = { add: vi.fn().mockResolvedValue({ id: 'job' }) };

    await expect(runOrderRiskMonitor(queue as never)).resolves.toEqual({
      orgsScanned: 2,
      ordersReviewed: 1,
    });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ shop: 'a.myshopify.com', err: 'Shopify unavailable' }),
      '[OrderRiskMonitor] order list fetch failed',
    );
  });

  it('propagates queue failures so the maintenance worker can retry', async () => {
    isEnabled.mockReturnValue(true);
    findMany.mockResolvedValue([
      { organizationId: 'org-a', externalAccountId: 'a.myshopify.com', accessToken: 'token-a' },
    ]);
    listOrderIds.mockResolvedValue(['100']);
    const queue = { add: vi.fn().mockRejectedValue(new Error('Redis unavailable')) };

    await expect(runOrderRiskMonitor(queue as never)).rejects.toThrow('Redis unavailable');
  });
});

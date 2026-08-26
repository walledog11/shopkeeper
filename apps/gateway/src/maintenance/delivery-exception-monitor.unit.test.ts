import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  findMany,
  getShipmentWatch,
  recordShipmentWatch,
  markShipmentWatchPlanPushed,
  markShipmentWatchSkipped,
  listRecentShippedOrderShipments,
  classifyShipmentAlert,
  pushDeliveryExceptionApprovalPlan,
  resolveDeliveryExceptionThread,
  isDeliveryExceptionMonitorEnabled,
  logger,
} = vi.hoisted(() => ({
  findMany: vi.fn(),
  getShipmentWatch: vi.fn(),
  recordShipmentWatch: vi.fn(),
  markShipmentWatchPlanPushed: vi.fn(),
  markShipmentWatchSkipped: vi.fn(),
  listRecentShippedOrderShipments: vi.fn(),
  classifyShipmentAlert: vi.fn(),
  pushDeliveryExceptionApprovalPlan: vi.fn(),
  resolveDeliveryExceptionThread: vi.fn(),
  isDeliveryExceptionMonitorEnabled: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@shopkeeper/db', () => ({
  db: { integration: { findMany } },
  getShipmentWatch,
  isTerminalShipmentWatchStatus: (status: string) => status === 'plan_pushed' || status === 'skipped',
  recordShipmentWatch,
  markShipmentWatchPlanPushed,
  markShipmentWatchSkipped,
}));

vi.mock('@shopkeeper/agent/shopify', () => ({
  listRecentShippedOrderShipments,
  classifyShipmentAlert,
  createShipmentTrackingResolver: vi.fn(),
  DEGRADED_STALL_AFTER_MS: 6 * 24 * 3_600_000,
  ShopifyRequestError: class ShopifyRequestError extends Error {
    status?: number;
    constructor(message: string, options: { status?: number } = {}) {
      super(message);
      this.status = options.status;
    }
  },
}));

vi.mock('../config/runtime-config.js', () => ({
  isDeliveryExceptionMonitorEnabled,
}));

vi.mock('../logger.js', () => ({ default: logger }));

vi.mock('./delivery-exception-plan.js', () => ({
  pushDeliveryExceptionApprovalPlan,
  resolveDeliveryExceptionThread,
}));

import { runDeliveryExceptionMonitor } from './delivery-exception-monitor.js';

const resolveTracking = vi.fn();

describe('runDeliveryExceptionMonitor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    findMany.mockReset();
    getShipmentWatch.mockReset();
    recordShipmentWatch.mockReset();
    markShipmentWatchPlanPushed.mockReset();
    markShipmentWatchSkipped.mockReset();
    listRecentShippedOrderShipments.mockReset();
    resolveTracking.mockReset();
    classifyShipmentAlert.mockReset();
    pushDeliveryExceptionApprovalPlan.mockReset();
    resolveDeliveryExceptionThread.mockReset();
    isDeliveryExceptionMonitorEnabled.mockReset();
    logger.warn.mockReset();
    getShipmentWatch.mockResolvedValue(null);
    resolveDeliveryExceptionThread.mockResolvedValue('thread-1');
    recordShipmentWatch.mockResolvedValue('watch-1');
    markShipmentWatchPlanPushed.mockResolvedValue(true);
    isDeliveryExceptionMonitorEnabled.mockReturnValue(true);
    findMany.mockResolvedValue([
      {
        organizationId: 'org-a',
        externalAccountId: 'a.myshopify.com',
        accessToken: 'token-a',
        organization: { settings: {} },
      },
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('parks when the monitor rollout flag is disabled', async () => {
    isDeliveryExceptionMonitorEnabled.mockReturnValue(false);

    await expect(runDeliveryExceptionMonitor(resolveTracking)).resolves.toEqual({
      orgsScanned: 0,
      shipmentsChecked: 0,
      issuesNotified: 0,
    });
    expect(findMany).not.toHaveBeenCalled();
  });

  it('skips simulated and expired integrations without listing shipments', async () => {
    findMany.mockResolvedValue([
      {
        organizationId: 'org-simulated',
        externalAccountId: 'demo-store.shopkeeper.test',
        accessToken: 'shopkeeper-development-simulator',
        tokenExpiresAt: null,
        metadata: { simulated: true },
        organization: { settings: {} },
      },
      {
        organizationId: 'org-expired',
        externalAccountId: 'expired.myshopify.com',
        accessToken: 'token-expired',
        tokenExpiresAt: new Date(0),
        metadata: null,
        organization: { settings: {} },
      },
    ]);

    const runPromise = runDeliveryExceptionMonitor(resolveTracking);
    await vi.runAllTimersAsync();
    await expect(runPromise).resolves.toEqual({
      orgsScanned: 0,
      shipmentsChecked: 0,
      issuesNotified: 0,
    });
    expect(listRecentShippedOrderShipments).not.toHaveBeenCalled();
  });

  it('skips shipments that already have a terminal watch row', async () => {
    getShipmentWatch.mockResolvedValue({ id: 'watch-old', status: 'plan_pushed' });
    listRecentShippedOrderShipments.mockResolvedValue([{
      orderId: '1001',
      customerShopifyId: '55',
      customerName: 'Sarah Jones',
      customerEmail: 'sarah@example.com',
      trackingNumber: '9400',
      trackingCompany: 'USPS',
      shipmentStatus: 'in_transit',
      statusUpdatedAt: '2026-07-10T10:00:00.000Z',
      fulfillmentCreatedAt: '2026-07-08T10:00:00.000Z',
    }]);

    const runPromise = runDeliveryExceptionMonitor(resolveTracking);
    await vi.runAllTimersAsync();
    await expect(runPromise).resolves.toEqual({
      orgsScanned: 1,
      shipmentsChecked: 0,
      issuesNotified: 0,
    });
    expect(resolveTracking).not.toHaveBeenCalled();
  });

  it('pushes an approval plan when a degraded USPS shipment stalls', async () => {
    listRecentShippedOrderShipments.mockResolvedValue([{
      orderId: '1001',
      customerShopifyId: '55',
      customerName: 'Sarah Jones',
      customerEmail: 'sarah@example.com',
      trackingNumber: '9400',
      trackingCompany: 'USPS',
      shipmentStatus: 'in_transit',
      statusUpdatedAt: '2026-07-10T10:00:00.000Z',
      fulfillmentCreatedAt: '2026-07-08T10:00:00.000Z',
    }]);
    resolveTracking.mockResolvedValue({
      snapshot: {
        status: 'in_transit',
        statusSummary: 'Shopify fulfillment record via USPS: in transit (no carrier scan history)',
        events: [{ message: 'Last Shopify fulfillment update', datetime: '2026-07-10T10:00:00.000Z' }],
      },
      source: 'shopify_degraded',
      tier: 'degraded',
    });
    classifyShipmentAlert.mockReturnValue('stalled');
    pushDeliveryExceptionApprovalPlan.mockResolvedValue('plan_pushed');

    const runPromise = runDeliveryExceptionMonitor(resolveTracking);
    await vi.runAllTimersAsync();
    await expect(runPromise).resolves.toEqual({
      orgsScanned: 1,
      shipmentsChecked: 1,
      issuesNotified: 1,
    });
    expect(resolveDeliveryExceptionThread).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'org-a',
      orderId: '1001',
      customerEmail: 'sarah@example.com',
    }));
    expect(pushDeliveryExceptionApprovalPlan).toHaveBeenCalledWith('org-a', expect.objectContaining({
      trackingSource: 'shopify_degraded',
    }));
    expect(markShipmentWatchPlanPushed).toHaveBeenCalledWith('watch-1', 'org-a');
  });
});

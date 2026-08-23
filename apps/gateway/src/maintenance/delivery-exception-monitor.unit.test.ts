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
  ShopifyRequestError: class ShopifyRequestError extends Error {
    status?: number;
    constructor(message: string, options: { status?: number } = {}) {
      super(message);
      this.status = options.status;
    }
  },
}));

vi.mock('../logger.js', () => ({ default: logger }));

vi.mock('./delivery-exception-plan.js', () => ({
  pushDeliveryExceptionApprovalPlan,
  resolveDeliveryExceptionThread,
}));

import {
  carrierTrackingProvider,
  runDeliveryExceptionMonitor,
} from './delivery-exception-monitor.js';

// The USPS client the monitor was built on is gone, so production has no
// provider to hand it. The loop below is exercised through the injected seam
// Phase 9.1 will fill; `parks without a carrier provider` pins the default.
const trackShipment = vi.fn();

describe('runDeliveryExceptionMonitor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    findMany.mockReset();
    getShipmentWatch.mockReset();
    recordShipmentWatch.mockReset();
    markShipmentWatchPlanPushed.mockReset();
    markShipmentWatchSkipped.mockReset();
    listRecentShippedOrderShipments.mockReset();
    trackShipment.mockReset();
    classifyShipmentAlert.mockReset();
    pushDeliveryExceptionApprovalPlan.mockReset();
    resolveDeliveryExceptionThread.mockReset();
    logger.warn.mockReset();
    getShipmentWatch.mockResolvedValue(null);
    resolveDeliveryExceptionThread.mockResolvedValue('thread-1');
    recordShipmentWatch.mockResolvedValue('watch-1');
    markShipmentWatchPlanPushed.mockResolvedValue(true);
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

  // The reason this monitor cannot fire in production, asserted rather than
  // described in a comment: there is no carrier to ask.
  it('parks without a carrier provider', async () => {
    expect(carrierTrackingProvider).toBeNull();

    await expect(runDeliveryExceptionMonitor()).resolves.toEqual({
      orgsScanned: 0,
      shipmentsChecked: 0,
      issuesNotified: 0,
    });
    expect(findMany).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      {},
      expect.stringContaining('no carrier tracking provider'),
    );
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

    const runPromise = runDeliveryExceptionMonitor(trackShipment);
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
    }]);

    const runPromise = runDeliveryExceptionMonitor(trackShipment);
    await vi.runAllTimersAsync();
    await expect(runPromise).resolves.toEqual({
      orgsScanned: 1,
      shipmentsChecked: 0,
      issuesNotified: 0,
    });
    expect(trackShipment).not.toHaveBeenCalled();
  });

  it('pushes an approval plan when the carrier reports an exception', async () => {
    listRecentShippedOrderShipments.mockResolvedValue([{
      orderId: '1001',
      customerShopifyId: '55',
      customerName: 'Sarah Jones',
      customerEmail: 'sarah@example.com',
      trackingNumber: '9400',
      trackingCompany: 'USPS',
    }]);
    trackShipment.mockResolvedValue({
      status: 'Alert',
      statusSummary: 'Return to Sender',
      events: [],
    });
    classifyShipmentAlert.mockReturnValue('exception');
    pushDeliveryExceptionApprovalPlan.mockResolvedValue('plan_pushed');

    const runPromise = runDeliveryExceptionMonitor(trackShipment);
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
    expect(pushDeliveryExceptionApprovalPlan).toHaveBeenCalled();
    expect(markShipmentWatchPlanPushed).toHaveBeenCalledWith('watch-1', 'org-a');
  });
});

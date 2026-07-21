import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  findMany,
  isEnabled,
  getShipmentWatch,
  recordShipmentWatch,
  markShipmentWatchPlanPushed,
  markShipmentWatchSkipped,
  listRecentShippedOrderShipments,
  fetchUspsTrackingSnapshot,
  classifyShipmentAlert,
  pushDeliveryExceptionApprovalPlan,
  resolveDeliveryExceptionThread,
  logger,
} = vi.hoisted(() => ({
  findMany: vi.fn(),
  isEnabled: vi.fn(),
  getShipmentWatch: vi.fn(),
  recordShipmentWatch: vi.fn(),
  markShipmentWatchPlanPushed: vi.fn(),
  markShipmentWatchSkipped: vi.fn(),
  listRecentShippedOrderShipments: vi.fn(),
  fetchUspsTrackingSnapshot: vi.fn(),
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
  fetchUspsTrackingSnapshot,
  classifyShipmentAlert,
  ShopifyRequestError: class ShopifyRequestError extends Error {
    status?: number;
    constructor(message: string, options: { status?: number } = {}) {
      super(message);
      this.status = options.status;
    }
  },
}));

vi.mock('../config/runtime-config.js', () => ({
  isDeliveryExceptionMonitorEnabled: isEnabled,
}));

vi.mock('./delivery-exception-config.js', () => ({
  isOrgDeliveryExceptionWatchEnabled: () => true,
}));

vi.mock('../logger.js', () => ({ default: logger }));

vi.mock('./delivery-exception-plan.js', () => ({
  pushDeliveryExceptionApprovalPlan,
  resolveDeliveryExceptionThread,
}));

import { runDeliveryExceptionMonitor } from './delivery-exception-monitor.js';

describe('runDeliveryExceptionMonitor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    findMany.mockReset();
    isEnabled.mockReset();
    getShipmentWatch.mockReset();
    recordShipmentWatch.mockReset();
    markShipmentWatchPlanPushed.mockReset();
    markShipmentWatchSkipped.mockReset();
    listRecentShippedOrderShipments.mockReset();
    fetchUspsTrackingSnapshot.mockReset();
    classifyShipmentAlert.mockReset();
    pushDeliveryExceptionApprovalPlan.mockReset();
    resolveDeliveryExceptionThread.mockReset();
    logger.warn.mockReset();
    isEnabled.mockReturnValue(true);
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

  it('does no I/O when the global flag is disabled', async () => {
    isEnabled.mockReturnValue(false);

    await expect(runDeliveryExceptionMonitor()).resolves.toEqual({
      orgsScanned: 0,
      shipmentsChecked: 0,
      issuesNotified: 0,
    });
    expect(findMany).not.toHaveBeenCalled();
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

    const runPromise = runDeliveryExceptionMonitor();
    await vi.runAllTimersAsync();
    await expect(runPromise).resolves.toEqual({
      orgsScanned: 1,
      shipmentsChecked: 0,
      issuesNotified: 0,
    });
    expect(fetchUspsTrackingSnapshot).not.toHaveBeenCalled();
  });

  it('pushes an approval plan when USPS reports an exception', async () => {
    listRecentShippedOrderShipments.mockResolvedValue([{
      orderId: '1001',
      customerShopifyId: '55',
      customerName: 'Sarah Jones',
      customerEmail: 'sarah@example.com',
      trackingNumber: '9400',
      trackingCompany: 'USPS',
    }]);
    fetchUspsTrackingSnapshot.mockResolvedValue({
      status: 'Alert',
      statusSummary: 'Return to Sender',
      events: [],
    });
    classifyShipmentAlert.mockReturnValue('exception');
    pushDeliveryExceptionApprovalPlan.mockResolvedValue('plan_pushed');

    const runPromise = runDeliveryExceptionMonitor();
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

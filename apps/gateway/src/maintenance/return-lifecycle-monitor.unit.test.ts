import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  findMany,
  isEnabled,
  listOpenReturnWatches,
  markReturnWatchPlanPushed,
  markReturnWatchSkipped,
  safeFetchOrderReturnStatuses,
  pushReturnArrivalApprovalPlan,
  logger,
} = vi.hoisted(() => ({
  findMany: vi.fn(),
  isEnabled: vi.fn(),
  listOpenReturnWatches: vi.fn(),
  markReturnWatchPlanPushed: vi.fn(),
  markReturnWatchSkipped: vi.fn(),
  safeFetchOrderReturnStatuses: vi.fn(),
  pushReturnArrivalApprovalPlan: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@shopkeeper/db', () => ({
  db: {
    integration: { findMany },
    agentAction: { findMany: vi.fn().mockResolvedValue([]) },
  },
  listOpenReturnWatches,
  markReturnWatchPlanPushed,
  markReturnWatchSkipped,
  ensureReturnWatchFromDelivery: vi.fn(),
}));

vi.mock('@shopkeeper/agent/shopify', () => ({
  safeFetchOrderReturnStatuses,
}));

vi.mock('../config/runtime-config.js', () => ({
  isReturnLifecycleMonitorEnabled: isEnabled,
}));

vi.mock('../logger.js', () => ({ default: logger }));

vi.mock('./return-arrival-plan.js', () => ({
  pushReturnArrivalApprovalPlan,
}));

import { runReturnLifecycleMonitor } from './return-lifecycle-monitor.js';

describe('runReturnLifecycleMonitor', () => {
  beforeEach(() => {
    findMany.mockReset();
    isEnabled.mockReset();
    listOpenReturnWatches.mockReset();
    markReturnWatchPlanPushed.mockReset();
    markReturnWatchSkipped.mockReset();
    safeFetchOrderReturnStatuses.mockReset();
    pushReturnArrivalApprovalPlan.mockReset();
    logger.warn.mockReset();
    logger.info.mockReset();
    markReturnWatchPlanPushed.mockResolvedValue(true);
    markReturnWatchSkipped.mockResolvedValue(true);
  });

  it('does no I/O when disabled', async () => {
    isEnabled.mockReturnValue(false);

    await expect(runReturnLifecycleMonitor()).resolves.toEqual({
      orgsScanned: 0,
      returnsChecked: 0,
      arrivalsNotified: 0,
    });
    expect(findMany).not.toHaveBeenCalled();
  });

  it('pushes an approval plan when a watched return is delivered', async () => {
    isEnabled.mockReturnValue(true);
    findMany.mockResolvedValue([
      { organizationId: 'org-a', externalAccountId: 'a.myshopify.com', accessToken: 'token-a' },
    ]);
    listOpenReturnWatches.mockResolvedValue([{
      id: 'watch-1',
      threadId: 'thread-1',
      orderId: '1001',
      shopifyReturnId: 'gid://shopify/Return/9',
      returnName: '#R12',
      tool: 'create_return',
      thread: { customer: { name: 'Sarah Jones' } },
    }]);
    safeFetchOrderReturnStatuses.mockResolvedValue([{
      returnId: 'gid://shopify/Return/9',
      returnName: '#R12',
      returnStatus: 'OPEN',
      deliveryState: 'delivered',
    }]);
    pushReturnArrivalApprovalPlan.mockResolvedValue('plan_pushed');

    await expect(runReturnLifecycleMonitor()).resolves.toEqual({
      orgsScanned: 1,
      returnsChecked: 1,
      arrivalsNotified: 1,
    });
    expect(pushReturnArrivalApprovalPlan).toHaveBeenCalledWith('org-a', expect.objectContaining({
      id: 'watch-1',
      orderId: '1001',
      shopifyReturnId: 'gid://shopify/Return/9',
    }));
    expect(markReturnWatchPlanPushed).toHaveBeenCalledWith('watch-1', 'org-a');
  });

  it('isolates Shopify failures to the affected order', async () => {
    isEnabled.mockReturnValue(true);
    findMany.mockResolvedValue([
      { organizationId: 'org-a', externalAccountId: 'a.myshopify.com', accessToken: 'token-a' },
    ]);
    listOpenReturnWatches.mockResolvedValue([{
      id: 'watch-1',
      threadId: 'thread-1',
      orderId: '1001',
      shopifyReturnId: 'gid://shopify/Return/9',
      returnName: '#R12',
      tool: 'create_return',
      thread: null,
    }]);
    safeFetchOrderReturnStatuses.mockResolvedValue(null);

    await expect(runReturnLifecycleMonitor()).resolves.toEqual({
      orgsScanned: 1,
      returnsChecked: 0,
      arrivalsNotified: 0,
    });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-a', orderId: '1001' }),
      '[ReturnLifecycleMonitor] return status fetch failed',
    );
    expect(pushReturnArrivalApprovalPlan).not.toHaveBeenCalled();
  });

  it('marks skipped watches when no operators are bound', async () => {
    isEnabled.mockReturnValue(true);
    findMany.mockResolvedValue([
      { organizationId: 'org-a', externalAccountId: 'a.myshopify.com', accessToken: 'token-a' },
    ]);
    listOpenReturnWatches.mockResolvedValue([{
      id: 'watch-1',
      threadId: 'thread-1',
      orderId: '1001',
      shopifyReturnId: 'gid://shopify/Return/9',
      returnName: '#R12',
      tool: 'create_return',
      thread: null,
    }]);
    safeFetchOrderReturnStatuses.mockResolvedValue([{
      returnId: 'gid://shopify/Return/9',
      returnName: '#R12',
      returnStatus: 'OPEN',
      deliveryState: 'delivered',
    }]);
    pushReturnArrivalApprovalPlan.mockResolvedValue('skipped');

    await expect(runReturnLifecycleMonitor()).resolves.toEqual({
      orgsScanned: 1,
      returnsChecked: 1,
      arrivalsNotified: 0,
    });
    expect(markReturnWatchSkipped).toHaveBeenCalledWith('watch-1', 'org-a');
  });
});

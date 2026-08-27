import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanupTestData,
  createTestCustomer,
  createTestIntegration,
  createTestMessage,
  createTestOrg,
  createTestThread,
} from '@shopkeeper/db/test-helpers';
import { ChannelType } from '@shopkeeper/db';
import { getShipmentWatch } from '@shopkeeper/db';

const { listRecentShippedOrderShipments, generateThreadPlanSpy, listOperatorBindingsSpy } = vi.hoisted(() => ({
  listRecentShippedOrderShipments: vi.fn(),
  generateThreadPlanSpy: vi.fn(),
  listOperatorBindingsSpy: vi.fn(),
}));

vi.mock('@shopkeeper/agent/shopify', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@shopkeeper/agent/shopify')>();
  return {
    ...actual,
    listRecentShippedOrderShipments,
  };
});

vi.mock('../message-handlers/generate-thread-plan.js', () => ({
  generateThreadPlan: generateThreadPlanSpy,
}));

vi.mock('../message-handlers/planning-notifications.js', () => ({
  sendOperatorPlanNotification: vi.fn(),
}));

vi.mock('../operator-notify.js', () => ({
  listOperatorBindings: listOperatorBindingsSpy,
  notifyOperator: vi.fn(),
}));

vi.mock('../config/runtime-config.js', () => ({
  isDeliveryExceptionMonitorEnabled: () => true,
}));

import { runDeliveryExceptionMonitor } from './delivery-exception-monitor.js';

let org!: Awaited<ReturnType<typeof createTestOrg>>;

const ACCEPTANCE_SHOP = 'acceptance.myshopify.com';

// The monitor sweeps every org with a Shopify integration, so a blanket
// mockResolvedValue would hand this shipment to whatever orgs other suites
// left in the database and inflate the counts. Answer only for this shop.
function onlyForAcceptanceShop(statusUpdatedAt: string) {
  return async (ctx: { shop: string }) => (
    ctx.shop === ACCEPTANCE_SHOP ? [degradedUspsShipment(statusUpdatedAt)] : []
  );
}

function degradedUspsShipment(statusUpdatedAt: string) {
  return {
    orderId: '1001',
    customerShopifyId: '55',
    customerName: 'Sarah Jones',
    customerEmail: 'sarah@example.com',
    trackingNumber: '9400',
    trackingCompany: 'USPS',
    shipmentStatus: 'in_transit',
    statusUpdatedAt,
    fulfillmentCreatedAt: '2026-07-08T10:00:00.000Z',
  };
}

beforeEach(async () => {
  org = await createTestOrg();
  listRecentShippedOrderShipments.mockReset();
  generateThreadPlanSpy.mockReset();
  listOperatorBindingsSpy.mockReset();
  listOperatorBindingsSpy.mockResolvedValue([{ clerkUserId: 'user_1', channel: 'telegram', contextKey: '1' }]);
  generateThreadPlanSpy.mockResolvedValue({
    plan: {
      instruction: 'heads-up',
      steps: [{ id: '1', tool: 'send_reply', label: 'Reply', description: 'Reply', category: 'communication', enabled: true }],
      rawToolCalls: [{ id: '1', name: 'send_reply', input: { message: 'Your package is still moving — we are checking with the carrier.' } }],
    },
    instruction: 'Delivery exception',
    identity: {
      planId: '11111111-1111-4111-8111-111111111111',
      sourceMessageId: '22222222-2222-4222-8222-222222222222',
      planHash: 'abc',
      instructionHash: 'def',
    },
  });

  await createTestIntegration(org.id, {
    platform: ChannelType.shopify,
    externalAccountId: ACCEPTANCE_SHOP,
    accessToken: 'test-token',
  });

  const customer = await createTestCustomer(org.id, 'sarah@example.com', { name: 'Sarah Jones' });
  const thread = await createTestThread(org.id, customer.id, 'email', {
    shopifyCustomerId: '55',
  });
  await createTestMessage(thread.id, 'Where is my order?');
});

afterEach(async () => {
  await cleanupTestData(org?.id);
});

describe('degraded USPS stall acceptance', () => {
  it('routes a six-day Shopify fulfillment stall through approval planning without carrier scans', async () => {
    const statusUpdatedAt = new Date(Date.now() - 7 * 24 * 3_600_000).toISOString();
    listRecentShippedOrderShipments.mockImplementation(onlyForAcceptanceShop(statusUpdatedAt));

    // orgsScanned counts every sweepable org in the database, so it belongs to
    // whatever else the suite left behind, not to this acceptance.
    const scan = await runDeliveryExceptionMonitor();
    expect(scan.shipmentsChecked).toBe(1);
    expect(scan.issuesNotified).toBe(1);

    const instruction = generateThreadPlanSpy.mock.calls[0]?.[3]?.instruction as string;
    expect(instruction).toContain('stalled in transit');
    expect(instruction).toContain('Shopify');
    expect(instruction).toContain('no carrier scan history');
    expect(instruction).toContain('no carrier scan history');
    expect(instruction).not.toContain('Carrier status:');

    const watch = await getShipmentWatch(org.id, '9400');
    expect(watch?.status).toBe('plan_pushed');
  });

  it('does not flag a degraded USPS shipment that updated within the six-day window', async () => {
    const statusUpdatedAt = new Date(Date.now() - 2 * 24 * 3_600_000).toISOString();
    listRecentShippedOrderShipments.mockImplementation(onlyForAcceptanceShop(statusUpdatedAt));

    const scan = await runDeliveryExceptionMonitor();
    expect(scan.shipmentsChecked).toBe(1);
    expect(scan.issuesNotified).toBe(0);
    expect(generateThreadPlanSpy).not.toHaveBeenCalled();
    await expect(getShipmentWatch(org.id, '9400')).resolves.toBeNull();
  });
});

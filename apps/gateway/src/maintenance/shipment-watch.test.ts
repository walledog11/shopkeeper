import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  cleanupTestData,
  createTestOrg,
} from '@shopkeeper/db/test-helpers';
import {
  getShipmentWatch,
  isTerminalShipmentWatchStatus,
  markShipmentWatchPlanPushed,
  recordShipmentWatch,
} from '@shopkeeper/db';

let org!: Awaited<ReturnType<typeof createTestOrg>>;

beforeEach(async () => {
  org = await createTestOrg();
});

afterEach(async () => {
  await cleanupTestData(org?.id);
});

describe('shipment watch helpers', () => {
  it('records and marks a watch as plan_pushed', async () => {
    const watchId = await recordShipmentWatch({
      organizationId: org.id,
      threadId: null,
      orderId: '1001',
      trackingNumber: '9400',
      trackingCompany: 'USPS',
      issueType: 'exception',
      issueSummary: 'Return to Sender',
    });

    await expect(getShipmentWatch(org.id, '9400')).resolves.toEqual({
      id: watchId,
      status: 'open',
    });
    expect(isTerminalShipmentWatchStatus('open')).toBe(false);

    await expect(markShipmentWatchPlanPushed(watchId, org.id)).resolves.toBe(true);
    await expect(getShipmentWatch(org.id, '9400')).resolves.toEqual({
      id: watchId,
      status: 'plan_pushed',
    });
    expect(isTerminalShipmentWatchStatus('plan_pushed')).toBe(true);
  });
});

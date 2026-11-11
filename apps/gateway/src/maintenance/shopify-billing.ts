import { db } from '@shopkeeper/db';
import { shopifyPartnerApiConfig, syncShopifyBilling } from '@shopkeeper/agent/shopify/billing';
import { isSimulatedShopifyIntegration } from '@shopkeeper/agent/shopify/integration-health';
import { JOB, QUEUE } from '../constants.js';
import logger from '../logger.js';
import {
  createMaintenanceQueue,
  createMaintenanceWorker,
  ONE_DAY_MS,
  scheduleRepeatableJob,
  type MaintenanceJobRegistration,
} from './registration.js';

// One workspace's read is an Admin API call and a Partner API call; the Partner
// API allows four requests a second per client.
const PARTNER_PACE_MS = 500;

/**
 * Shopify App Pricing sends no webhook when a plan changes, so every workspace
 * with a live store has its plan read once a day: an ended plan is noticed, and
 * the billing write gate stops its writes, without anyone opening the app.
 */
async function runShopifyBillingCheck(): Promise<void> {
  if (!shopifyPartnerApiConfig()) {
    logger.info('[ShopifyBilling] Partner API not configured — skipping');
    return;
  }
  const stores = await db.integration.findMany({
    where: { platform: 'shopify', lifecycleStatus: 'active', organization: { lifecycleStatus: 'active' } },
    select: { organizationId: true, metadata: true },
  });
  const organizationIds = [...new Set(
    stores.filter((store) => !isSimulatedShopifyIntegration(store.metadata)).map((store) => store.organizationId),
  )];

  const counts = { active: 0, inactive: 0, none: 0, skipped: 0, failed: 0 };
  for (const [index, organizationId] of organizationIds.entries()) {
    if (index > 0) await new Promise((resolve) => setTimeout(resolve, PARTNER_PACE_MS));
    try {
      const state = await syncShopifyBilling(organizationId);
      if (!state) counts.skipped += 1;
      else counts[state.status ?? 'none'] += 1;
    } catch (error) {
      counts.failed += 1;
      logger.error({ err: error, organizationId }, '[ShopifyBilling] Could not read the plan');
    }
  }
  logger.info({ workspaces: organizationIds.length, ...counts }, '[ShopifyBilling] Daily plan check complete');
}

export const registerShopifyBillingMaintenanceJob: MaintenanceJobRegistration = async (context) => {
  const queue = createMaintenanceQueue(context, QUEUE.SHOPIFY_BILLING);
  await scheduleRepeatableJob(queue, JOB.SHOPIFY_BILLING_CHECK, JOB.SHOPIFY_BILLING_ID, ONE_DAY_MS);

  const worker = createMaintenanceWorker(context, QUEUE.SHOPIFY_BILLING, runShopifyBillingCheck, {
    label: 'ShopifyBilling',
    failureQueue: 'shopify-billing',
  });

  return { workers: [worker], queues: [queue] };
};

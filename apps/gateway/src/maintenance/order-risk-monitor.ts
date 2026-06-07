import type { Queue } from 'bullmq';
import { db } from '@shopkeeper/db';
import logger from '../logger.js';
import { JOB, QUEUE, SHOPIFY_API_VERSION } from '../constants.js';
import type { OrderReviewJobData } from '../types.js';
import {
  createMaintenanceQueue,
  createMaintenanceWorker,
  ONE_HOUR_MS,
  scheduleRepeatableJob,
  type MaintenanceJobRegistration,
} from './registration.js';

// Order-ops (module #2) backstop. Scheduled, thread-less, flag-gated by
// ORDER_RISK_MONITOR_ENABLED so it never runs for merchants. This is the
// BACKSTOP trigger only — the orders/created webhook is primary. The sweep does
// order DISCOVERY here (a raw Shopify list, bypassing the seam — acceptable at
// solo-merchant volume) and enqueues each order into the in-process
// order-review queue, the same path the webhook feeds. No more dashboard hop.

const ORDERS_PER_ORG = 10;

interface RawOrderListEntry {
  id: number;
}

async function listRecentUnfulfilledOrderIds(shop: string, accessToken: string): Promise<string[]> {
  const url =
    `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/orders.json` +
    `?status=open&fulfillment_status=unfulfilled&financial_status=paid&limit=${ORDERS_PER_ORG}&fields=id`;
  const res = await fetch(url, { headers: { 'X-Shopify-Access-Token': accessToken } });
  if (!res.ok) {
    logger.warn({ shop, status: res.status }, '[OrderRiskMonitor] order list fetch failed');
    return [];
  }
  const data = (await res.json()) as { orders?: RawOrderListEntry[] };
  return (data.orders ?? []).map((o) => String(o.id));
}

export async function runOrderRiskMonitor(
  reviewQueue: Queue<OrderReviewJobData>,
): Promise<{ orgsScanned: number; ordersReviewed: number }> {
  if (!process.env.ORDER_RISK_MONITOR_ENABLED) {
    return { orgsScanned: 0, ordersReviewed: 0 };
  }

  const integrations = await db.integration.findMany({
    where: { platform: 'shopify', accessToken: { not: null } },
    select: { organizationId: true, externalAccountId: true, accessToken: true },
  });

  let ordersReviewed = 0;
  for (const integration of integrations) {
    if (!integration.accessToken || !integration.externalAccountId) continue;
    const shop = integration.externalAccountId;
    const orderIds = await listRecentUnfulfilledOrderIds(shop, integration.accessToken);
    for (const orderId of orderIds) {
      // Same stable jobId as the webhook path — dedupes a webhook-reviewed order
      // against this backstop within the queue's retention window.
      await reviewQueue.add(
        JOB.ORDER_REVIEW,
        { organizationId: integration.organizationId, orderId },
        { jobId: `order-review:${shop}:${orderId}` },
      );
      ordersReviewed += 1;
    }
  }

  return { orgsScanned: integrations.length, ordersReviewed };
}

export const registerOrderRiskMaintenanceJob: MaintenanceJobRegistration = async (context) => {
  const queue = createMaintenanceQueue(context, QUEUE.ORDER_RISK);
  await scheduleRepeatableJob(queue, JOB.ORDER_RISK_SCAN, JOB.ORDER_RISK_ID, ONE_HOUR_MS);

  const reviewQueue = createMaintenanceQueue<OrderReviewJobData>(context, QUEUE.ORDER_REVIEW);

  const worker = createMaintenanceWorker(context, QUEUE.ORDER_RISK, async () => {
    const result = await runOrderRiskMonitor(reviewQueue);
    if (result.ordersReviewed > 0) {
      logger.info(result, '[OrderRiskMonitor] Scan complete');
    }
  }, {
    label: 'OrderRiskMonitor',
    sentryQueue: 'order-risk-monitor',
  });

  return { workers: [worker], queues: [queue, reviewQueue] };
};

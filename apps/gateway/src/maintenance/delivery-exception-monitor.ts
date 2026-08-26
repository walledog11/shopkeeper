import {
  classifyShipmentAlert,
  createShipmentTrackingResolver,
  DEGRADED_STALL_AFTER_MS,
  listRecentShippedOrderShipments,
  ShopifyRequestError,
} from '@shopkeeper/agent/shopify';
import {
  db,
  getShipmentWatch,
  isTerminalShipmentWatchStatus,
  markShipmentWatchPlanPushed,
  markShipmentWatchSkipped,
  recordShipmentWatch,
} from '@shopkeeper/db';
import { isShopifyIntegrationSweepable } from '@shopkeeper/agent/shopify/integration-health';
import { isDeliveryExceptionMonitorEnabled } from '../config/runtime-config.js';
import logger from '../logger.js';
import { JOB, QUEUE } from '../constants.js';
import {
  createMaintenanceQueue,
  createMaintenanceWorker,
  ONE_HOUR_MS,
  scheduleRepeatableJob,
  type MaintenanceJobRegistration,
} from './registration.js';
import {
  pushDeliveryExceptionApprovalPlan,
  resolveDeliveryExceptionThread,
} from './delivery-exception-plan.js';

export { deliveryExceptionIdempotencyKey } from './delivery-exception-plan.js';

const SHIPMENTS_PER_ORG = 25;
const CARRIER_LOOKUP_DELAY_MS = 150;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const resolveShipmentTrackingSnapshot = createShipmentTrackingResolver(null);

async function handleDetectedIssue(params: {
  organizationId: string;
  watchId: string;
  threadId: string | null;
  orderId: string;
  trackingNumber: string;
  trackingCompany: string | null;
  issueType: 'exception' | 'stalled';
  issueSummary: string | null;
  trackingSource: 'shopify_degraded' | 'carrier';
  customerName: string | null;
}): Promise<boolean> {
  const outcome = await pushDeliveryExceptionApprovalPlan(params.organizationId, {
    id: params.watchId,
    threadId: params.threadId,
    orderId: params.orderId,
    trackingNumber: params.trackingNumber,
    trackingCompany: params.trackingCompany,
    issueType: params.issueType,
    issueSummary: params.issueSummary,
    customerName: params.customerName,
    trackingSource: params.trackingSource,
  });

  if (outcome === 'plan_pushed' || outcome === 'notify_only') {
    const marked = await markShipmentWatchPlanPushed(params.watchId, params.organizationId);
    if (!marked) {
      logger.info(
        { organizationId: params.organizationId, watchId: params.watchId },
        '[DeliveryExceptionMonitor] issue already handled on another worker',
      );
    }
    return true;
  }

  await markShipmentWatchSkipped(params.watchId, params.organizationId);
  return false;
}

export async function runDeliveryExceptionMonitor(
  trackingResolver: typeof resolveShipmentTrackingSnapshot = resolveShipmentTrackingSnapshot,
): Promise<{
  orgsScanned: number;
  shipmentsChecked: number;
  issuesNotified: number;
}> {
  if (!isDeliveryExceptionMonitorEnabled()) {
    return { orgsScanned: 0, shipmentsChecked: 0, issuesNotified: 0 };
  }

  const integrations = await db.integration.findMany({
    where: { platform: 'shopify', accessToken: { not: null } },
    select: {
      organizationId: true,
      externalAccountId: true,
      accessToken: true,
      tokenExpiresAt: true,
      metadata: true,
    },
  });

  let shipmentsChecked = 0;
  let issuesNotified = 0;
  let orgsScanned = 0;

  for (const integration of integrations) {
    if (!integration.accessToken || !integration.externalAccountId) continue;
    if (!isShopifyIntegrationSweepable(integration)) continue;
    orgsScanned += 1;

    const ctx = {
      shop: integration.externalAccountId,
      accessToken: integration.accessToken,
    };

    let shipments;
    try {
      shipments = await listRecentShippedOrderShipments(ctx, SHIPMENTS_PER_ORG);
    } catch (error) {
      logger.warn(
        {
          organizationId: integration.organizationId,
          status: error instanceof ShopifyRequestError ? error.status : undefined,
          err: error instanceof Error ? error.message : String(error),
        },
        '[DeliveryExceptionMonitor] shipped-order list fetch failed',
      );
      continue;
    }

    for (const shipment of shipments) {
      const existingWatch = await getShipmentWatch(
        integration.organizationId,
        shipment.trackingNumber,
      );
      if (existingWatch && isTerminalShipmentWatchStatus(existingWatch.status)) {
        continue;
      }

      const resolved = await trackingResolver(shipment);
      if (resolved?.tier === 'full') {
        await sleep(CARRIER_LOOKUP_DELAY_MS);
      }
      if (!resolved) continue;

      const { snapshot, source: trackingSource } = resolved;
      shipmentsChecked += 1;
      const issueType = classifyShipmentAlert(snapshot, {
        stalledAfterMs: trackingSource === 'shopify_degraded'
          ? DEGRADED_STALL_AFTER_MS
          : undefined,
      });
      if (!issueType) continue;

      const threadId = await resolveDeliveryExceptionThread({
        organizationId: integration.organizationId,
        shopifyCustomerId: shipment.customerShopifyId,
        customerEmail: shipment.customerEmail,
        customerName: shipment.customerName,
        orderId: shipment.orderId,
      });
      const watchId = await recordShipmentWatch({
        organizationId: integration.organizationId,
        threadId,
        orderId: shipment.orderId,
        trackingNumber: shipment.trackingNumber,
        trackingCompany: shipment.trackingCompany,
        issueType,
        issueSummary: snapshot.statusSummary,
      });

      const notified = await handleDetectedIssue({
        organizationId: integration.organizationId,
        watchId,
        threadId,
        orderId: shipment.orderId,
        trackingNumber: shipment.trackingNumber,
        trackingCompany: shipment.trackingCompany,
        issueType,
        issueSummary: snapshot.statusSummary,
        trackingSource,
        customerName: shipment.customerName,
      });
      if (notified) {
        issuesNotified += 1;
        logger.info(
          {
            organizationId: integration.organizationId,
            orderId: shipment.orderId,
            trackingNumber: shipment.trackingNumber,
            issueType,
            trackingSource,
            threadId,
            watchId,
          },
          '[DeliveryExceptionMonitor] pushed delivery-exception approval plan',
        );
      }
    }
  }

  return {
    orgsScanned,
    shipmentsChecked,
    issuesNotified,
  };
}

export const registerDeliveryExceptionMaintenanceJob: MaintenanceJobRegistration = async (context) => {
  const queue = createMaintenanceQueue(context, QUEUE.DELIVERY_EXCEPTION);
  await scheduleRepeatableJob(queue, JOB.DELIVERY_EXCEPTION_SCAN, JOB.DELIVERY_EXCEPTION_ID, ONE_HOUR_MS);

  const worker = createMaintenanceWorker(context, QUEUE.DELIVERY_EXCEPTION, runDeliveryExceptionMonitor, {
    label: 'DeliveryException',
    failureQueue: QUEUE.DELIVERY_EXCEPTION,
  });

  return { workers: [worker], queues: [queue] };
};

import {
  db,
  getShipmentWatch,
  isTerminalShipmentWatchStatus,
  markShipmentWatchPlanPushed,
  markShipmentWatchSkipped,
  recordShipmentWatch,
} from '@shopkeeper/db';
import {
  classifyShipmentAlert,
  listRecentShippedOrderShipments,
  ShopifyRequestError,
  type ShopifyContext,
  type ShipmentTrackingSnapshot,
} from '@shopkeeper/agent/shopify';
import { isShopifyIntegrationSweepable } from '@shopkeeper/agent/shopify/integration-health';
import logger from '../logger.js';
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

// Where a carrier lookup goes. It is null because the USPS client this monitor
// was built on has been removed — the API does not work — and nothing has
// replaced it yet. A typed absence rather than a silent one: the scan refuses
// to run and the hourly job is not scheduled, so the monitor cannot look alive
// in the queue while being incapable of detecting anything.
//
// Capability-plan Phase 9.1 fills this in with one provider behind this shape.
// Everything downstream of it — the watch dedupe, the stall/exception
// classifier, thread resolution, the approval plan — is carrier-agnostic and
// was left in place for that.
export type CarrierTrackingProvider = (
  trackingNumber: string,
) => Promise<ShipmentTrackingSnapshot | null>;

export const carrierTrackingProvider: CarrierTrackingProvider | null = null;

async function handleDetectedIssue(params: {
  organizationId: string;
  watchId: string;
  threadId: string | null;
  orderId: string;
  trackingNumber: string;
  trackingCompany: string | null;
  issueType: 'exception' | 'stalled';
  issueSummary: string | null;
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
  provider: CarrierTrackingProvider | null = carrierTrackingProvider,
): Promise<{
  orgsScanned: number;
  shipmentsChecked: number;
  issuesNotified: number;
}> {
  if (!provider) {
    logger.warn(
      {},
      '[DeliveryExceptionMonitor] no carrier tracking provider configured; nothing to scan',
    );
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

    const ctx: ShopifyContext = {
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

      const snapshot = await provider(shipment.trackingNumber);
      await sleep(CARRIER_LOOKUP_DELAY_MS);
      if (!snapshot) continue;

      shipmentsChecked += 1;
      const issueType = classifyShipmentAlert(snapshot);
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

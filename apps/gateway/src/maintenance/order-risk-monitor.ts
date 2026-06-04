import { db } from '@clerk/db';
import logger from '../logger.js';
import { SHOPIFY_API_VERSION } from '../constants.js';
import { getGatewayDashboardUrl } from '../config/env.js';
import { getInternalApiSecret } from '../message-handlers/shared.js';

// Track 4 spike (fraud-risk monitor). Scheduled, thread-less, flag-gated by
// ORDER_RISK_MONITOR_ENABLED so it never runs for merchants. The gateway only
// does order DISCOVERY here (a raw Shopify list, bypassing the seam - the same
// crack flagged for module #2); the per-order agent judgment runs in the
// dashboard via the thread-less order-ops path.

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

async function reviewOrder(orgId: string, orderId: string): Promise<void> {
  try {
    const res = await fetch(`${getGatewayDashboardUrl()}/api/agent/order-risk-internal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': getInternalApiSecret() },
      body: JSON.stringify({ orgId, orderId }),
    });
    if (!res.ok) {
      const responseBody = await res.text().catch(() => '');
      logger.warn(
        { orgId, orderId, status: res.status, body: responseBody.slice(0, 200) },
        '[OrderRiskMonitor] order-risk-internal failed',
      );
      return;
    }
    const data = (await res.json()) as { flagged?: boolean; flagReason?: string | null };
    if (data.flagged) {
      logger.info({ orgId, orderId, reason: data.flagReason }, '[OrderRiskMonitor] order flagged for review');
    }
  } catch (err) {
    logger.warn({ err: (err as Error).message, orgId, orderId }, '[OrderRiskMonitor] review call errored');
  }
}

export async function runOrderRiskMonitor(): Promise<{ orgsScanned: number; ordersReviewed: number }> {
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
    const orderIds = await listRecentUnfulfilledOrderIds(integration.externalAccountId, integration.accessToken);
    for (const orderId of orderIds) {
      await reviewOrder(integration.organizationId, orderId);
      ordersReviewed += 1;
    }
  }

  return { orgsScanned: integrations.length, ordersReviewed };
}

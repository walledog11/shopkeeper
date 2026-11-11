import { NextResponse } from 'next/server';
import { db, INTEGRATION_REAUTH_SENTINEL } from '@shopkeeper/db';
import { shopifyRestJson, ShopifyRequestError } from '@shopkeeper/agent/shopify';
import { shopifyContextFor, type ShopifyAccessRow } from '@shopkeeper/agent/shopify/access';
import { getRedis } from '@/lib/server/redis';
import logger from '@/lib/server/logger';
import {
  isShopifyIntegrationOperational,
  isSimulatedShopifyIntegration,
} from '@shopkeeper/agent/shopify/integration-health';

export {
  getShopifyConnectionState,
  isShopifyIntegrationOperational,
  missingShopifyScopes,
  recordedShopifyScopes,
  type ShopifyConnectionState,
} from '@shopkeeper/agent/shopify/integration-health';

const PROBE_COOLDOWN_SECS = 60;

export function isShopifyAuthFailure(status: number | undefined): boolean {
  return status === 401 || status === 403;
}

export async function markShopifyIntegrationInvalidIfAuthFailure(
  integrationId: string,
  organizationId: string,
  err: unknown,
): Promise<boolean> {
  if (!(err instanceof ShopifyRequestError) || !isShopifyAuthFailure(err.status)) {
    return false;
  }

  const result = await db.integration.updateMany({
    where: {
      id: integrationId,
      organizationId,
      platform: 'shopify',
      // Not already marked. An expiring token's past end is not a mark.
      OR: [
        { tokenExpiresAt: null },
        { tokenExpiresAt: { gt: INTEGRATION_REAUTH_SENTINEL } },
      ],
    },
    data: { tokenExpiresAt: INTEGRATION_REAUTH_SENTINEL },
  });

  if (result.count > 0) {
    logger.warn(
      { integrationId, organizationId, status: err.status },
      '[Shopify] Marked integration auth invalid',
    );
  }

  return result.count > 0;
}

export async function shopifyRouteErrorResponse(
  err: unknown,
  integration: { id: string },
  organizationId: string,
): Promise<NextResponse | null> {
  if (!(err instanceof ShopifyRequestError)) return null;

  await markShopifyIntegrationInvalidIfAuthFailure(integration.id, organizationId, err);

  return NextResponse.json(
    { error: 'shopify_error', details: err.payload ?? {} },
    { status: err.status ?? 502 },
  );
}

async function claimProbeSlot(integrationId: string): Promise<boolean> {
  try {
    const claimed = await getRedis().set(`shopify-health-probe:${integrationId}`, '1', {
      nx: true,
      ex: PROBE_COOLDOWN_SECS,
    });
    return claimed !== null;
  } catch (err) {
    logger.warn({ err, integrationId }, '[Shopify] Health probe skipped — redis unavailable');
    return false;
  }
}

export async function refreshShopifyIntegrationHealthIfDue(integration: ShopifyAccessRow & {
  organizationId: string;
  metadata?: unknown;
}): Promise<Date | null> {
  if (isSimulatedShopifyIntegration(integration.metadata)) {
    return integration.tokenExpiresAt;
  }

  if (!isShopifyIntegrationOperational(integration)) {
    return integration.tokenExpiresAt;
  }

  if (!(await claimProbeSlot(integration.id))) {
    return integration.tokenExpiresAt;
  }

  // Null here means a refresh was just refused, which marked the integration.
  const ctx = await shopifyContextFor(integration);
  if (!ctx) return INTEGRATION_REAUTH_SENTINEL;

  try {
    await shopifyRestJson(ctx, 'shop.json', { maxRetries: 0, query: { fields: 'id' } });
    return integration.tokenExpiresAt;
  } catch (err) {
    const marked = await markShopifyIntegrationInvalidIfAuthFailure(
      integration.id,
      integration.organizationId,
      err,
    );
    return marked ? INTEGRATION_REAUTH_SENTINEL : integration.tokenExpiresAt;
  }
}

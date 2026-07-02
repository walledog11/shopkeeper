import { NextResponse } from 'next/server';
import { db } from '@shopkeeper/db';
import { shopifyRestJson, ShopifyRequestError } from '@shopkeeper/agent/shopify';
import { getRedis } from '@/lib/server/redis';
import logger from '@/lib/server/logger';
import { isSimulatedShopifyIntegration } from '@/lib/integrations/shopify-simulator';

export type ShopifyConnectionState = 'active' | 'invalid' | 'incomplete';

const PROBE_COOLDOWN_SECS = 60;

export function isShopifyAuthFailure(status: number | undefined): boolean {
  return status === 401 || status === 403;
}

export function getShopifyConnectionState(integration: {
  accessToken: string | null;
  tokenExpiresAt: Date | null;
}): ShopifyConnectionState {
  if (!integration.accessToken) return 'incomplete';
  if (
    integration.tokenExpiresAt !== null &&
    integration.tokenExpiresAt.getTime() <= Date.now()
  ) {
    return 'invalid';
  }
  return 'active';
}

export function isShopifyIntegrationOperational(integration: {
  accessToken: string | null;
  tokenExpiresAt: Date | null;
}): boolean {
  return getShopifyConnectionState(integration) === 'active';
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
      OR: [
        { tokenExpiresAt: null },
        { tokenExpiresAt: { gt: new Date() } },
      ],
    },
    data: { tokenExpiresAt: new Date(0) },
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

export async function refreshShopifyIntegrationHealthIfDue(integration: {
  id: string;
  organizationId: string;
  externalAccountId: string;
  accessToken: string | null;
  tokenExpiresAt: Date | null;
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

  try {
    await shopifyRestJson(
      { shop: integration.externalAccountId, accessToken: integration.accessToken! },
      'shop.json',
      { maxRetries: 0, query: { fields: 'id' } },
    );
    return integration.tokenExpiresAt;
  } catch (err) {
    const marked = await markShopifyIntegrationInvalidIfAuthFailure(
      integration.id,
      integration.organizationId,
      err,
    );
    return marked ? new Date(0) : integration.tokenExpiresAt;
  }
}

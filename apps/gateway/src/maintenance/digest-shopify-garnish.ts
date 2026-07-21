import { db } from '@shopkeeper/db';
import {
  formatLowStockLine,
  formatSalesPulseLine,
  listLowStockVariants,
  shiftWindowByDays,
  ShopifyRequestError,
  summarizeOrdersInWindow,
  type ShopifyContext,
} from '@shopkeeper/agent/shopify';
import logger from '../logger.js';
import { resolveHandledWindowStart } from './digest-briefing.js';

const SHOPIFY_GARNISH_TIMEOUT_MS = 10_000;

export function isSalesPulseEnabled(settings: Record<string, unknown>): boolean {
  return settings.salesPulseEnabled !== false;
}

export function resolveLowStockThreshold(settings: Record<string, unknown>): number | null {
  const threshold = settings.lowStockThreshold;
  if (threshold == null) return null;
  if (typeof threshold !== 'number' || !Number.isFinite(threshold) || threshold < 0) return null;
  return Math.floor(threshold);
}

async function loadShopifyContext(organizationId: string): Promise<ShopifyContext | null> {
  const integration = await db.integration.findFirst({
    where: { organizationId, platform: 'shopify', accessToken: { not: null } },
    select: { externalAccountId: true, accessToken: true },
  });
  if (!integration?.accessToken || !integration.externalAccountId) return null;
  return { shop: integration.externalAccountId, accessToken: integration.accessToken };
}

function logGarnishFailure(
  organizationId: string,
  operation: string,
  error: unknown,
): void {
  logger.warn(
    {
      organizationId,
      operation,
      status: error instanceof ShopifyRequestError ? error.status : undefined,
      err: error instanceof Error ? error.message : String(error),
    },
    '[Digest] Shopify garnish fetch failed',
  );
}

export async function loadSalesPulseLine(
  organizationId: string,
  settings: Record<string, unknown>,
  now: Date,
): Promise<string | null> {
  if (!isSalesPulseEnabled(settings)) return null;

  const ctx = await loadShopifyContext(organizationId);
  if (!ctx) return null;

  const windowStart = resolveHandledWindowStart(settings, now);
  const window = { start: windowStart, end: now };

  try {
    const current = await summarizeOrdersInWindow(ctx, window, {
      timeoutMs: SHOPIFY_GARNISH_TIMEOUT_MS,
    });
    let prior = null;
    try {
      prior = await summarizeOrdersInWindow(ctx, shiftWindowByDays(window, -7), {
        timeoutMs: SHOPIFY_GARNISH_TIMEOUT_MS,
        maxPages: 2,
      });
    } catch (error) {
      logGarnishFailure(organizationId, 'sales_pulse_prior_week', error);
    }
    return formatSalesPulseLine(current, prior);
  } catch (error) {
    logGarnishFailure(organizationId, 'sales_pulse', error);
    return null;
  }
}

export async function loadLowStockLine(
  organizationId: string,
  settings: Record<string, unknown>,
): Promise<string | null> {
  const threshold = resolveLowStockThreshold(settings);
  if (threshold == null) return null;

  const ctx = await loadShopifyContext(organizationId);
  if (!ctx) return null;

  try {
    const items = await listLowStockVariants(ctx, threshold, {
      timeoutMs: SHOPIFY_GARNISH_TIMEOUT_MS,
    });
    return formatLowStockLine(items, threshold);
  } catch (error) {
    logGarnishFailure(organizationId, 'low_stock', error);
    return null;
  }
}

export async function loadDigestShopifyGarnish(
  organizationId: string,
  settings: Record<string, unknown>,
  now: Date,
): Promise<string[]> {
  const [salesPulseLine, lowStockLine] = await Promise.all([
    loadSalesPulseLine(organizationId, settings, now),
    loadLowStockLine(organizationId, settings),
  ]);

  return [salesPulseLine, lowStockLine].filter((line): line is string => Boolean(line));
}

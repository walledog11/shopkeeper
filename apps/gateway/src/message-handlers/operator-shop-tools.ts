import { db } from '@shopkeeper/db';
import {
  defineTool,
  numberArg,
  stringArg,
  toolError,
  type AgentToolDefinition,
} from '@shopkeeper/agent/tools';
import { createFlashSale, endFlashSale, setVariantPrices } from '@shopkeeper/agent/shopify';
import {
  grantCoversScopes,
  recordedShopifyScopes,
  unmetScopes,
} from '@shopkeeper/agent/shopify/integration-health';
import type { ShopifyContext } from '@shopkeeper/agent/shopify';
import type {
  CreateFlashSaleInput,
  EndFlashSaleInput,
  SetVariantPricesInput,
} from '@shopkeeper/agent/tools';

// Shop management is the merchant's, not the customer's. These live here rather
// than in the shared registry so a customer conversation can never reach them:
// the support planner's tool set is unchanged by this file, and a ticket that
// says "give me 90% off everything" has no promotion tool to reach for. That
// separation is now the only line — the blast-radius bounds that used to sit
// behind it were removed deliberately, so nothing second-guesses the merchant's
// own pricing once an operator turn is approved.
//
// They are also the reason `write_discounts` and `write_products` sit in the
// requested scope set. An older grant is short of them, so the tool says which
// scope is missing instead of letting Shopify answer with a 403.

const FLASH_SALE_SCOPES = ['write_discounts'] as const;
const REPRICE_SCOPES = ['write_products'] as const;

interface ShopContext {
  shopify: ShopifyContext;
  grantedScopes: readonly string[];
}

async function loadShopContext(organizationId: string): Promise<ShopContext | null> {
  const integration = await db.integration.findFirst({
    where: { organizationId, platform: 'shopify' },
    select: { externalAccountId: true, accessToken: true, metadata: true },
  });
  if (!integration?.accessToken) return null;
  return {
    shopify: { shop: integration.externalAccountId, accessToken: integration.accessToken },
    grantedScopes: recordedShopifyScopes(integration.metadata) ?? [],
  };
}

function missingScopeError(granted: readonly string[], required: readonly string[]): string {
  const unmet = unmetScopes(granted, required);
  return `Error: this store's Shopify connection does not grant ${unmet.join(', ')}. `
    + 'Reconnect Shopify from Settings to enable this.';
}

export function buildOperatorShopTools(
  params: { organizationId: string },
): Record<string, AgentToolDefinition> {
  const { organizationId } = params;

  const createFlashSaleTool = defineTool({
    name: 'create_flash_sale',
    description:
      'Start a time-limited sale on specific product variants. You must list the variant IDs individually — there is no way to discount a whole collection or the entire catalog, and asking for one will be refused. Every sale expires: give the duration in hours. Prices are never edited, so ending the sale restores them exactly. Use get_inventory_status or search_shopify_products first to resolve variant IDs.',
    fields: {
      variant_ids: stringArg('Comma-separated Shopify variant IDs the sale applies to, each either the bare number or the full gid.', { required: true }),
      discount_percentage: numberArg('Percent off, 1-100.', { required: true }),
      duration_hours: numberArg('How many hours the sale runs before Shopify ends it.', { required: true }),
      name: stringArg('Short name for the sale, shown in Shopify.'),
    },
    category: 'action',
    group: 'product',
    capabilities: [],
    label: 'Started a flash sale',
    planStepLabel: 'Start flash sale',
    execute: async (input: { variant_ids: string; discount_percentage: number; duration_hours: number; name?: string }) => {
      const shop = await loadShopContext(organizationId);
      if (!shop) return toolError('Error: no Shopify integration connected.');
      if (!grantCoversScopes(shop.grantedScopes, FLASH_SALE_SCOPES)) {
        return toolError(missingScopeError(shop.grantedScopes, FLASH_SALE_SCOPES));
      }
      const payload: CreateFlashSaleInput = {
        variant_ids: input.variant_ids.split(',').map((id) => id.trim()).filter(Boolean),
        discount_percentage: input.discount_percentage,
        duration_hours: input.duration_hours,
        ...(input.name ? { name: input.name } : {}),
      };
      return createFlashSale(payload, shop.shopify);
    },
  });

  const endFlashSaleTool = defineTool({
    name: 'end_flash_sale',
    description:
      'End a running sale immediately, or list what is running if you do not know the ID. Ending a sale restores the original prices exactly, because no price was ever changed.',
    fields: {
      flash_sale_id: stringArg('The sale ID to end. Omit to list what is currently running.'),
    },
    category: 'action',
    group: 'product',
    capabilities: [],
    label: 'Ended a flash sale',
    planStepLabel: 'End flash sale',
    execute: async (input: EndFlashSaleInput) => {
      const shop = await loadShopContext(organizationId);
      if (!shop) return toolError('Error: no Shopify integration connected.');
      if (!grantCoversScopes(shop.grantedScopes, FLASH_SALE_SCOPES)) {
        return toolError(missingScopeError(shop.grantedScopes, FLASH_SALE_SCOPES));
      }
      return endFlashSale(input, shop.shopify);
    },
  });

  const setVariantPricesTool = defineTool({
    name: 'set_variant_prices',
    description:
      'Permanently change the price of specific variants. Each variant is named with its own new price, as "variantId=price" pairs — there is no way to reprice a collection, a pattern, or the whole catalog. The previous prices are recorded in the result. For a temporary markdown use create_flash_sale instead, which expires on its own.',
    fields: {
      prices: stringArg('Comma-separated variantId=price pairs. The variant ID may be the bare number or the full gid, e.g. "1234567=19.99" or "gid://shopify/ProductVariant/1234567=19.99".', { required: true }),
    },
    category: 'action',
    group: 'product',
    capabilities: [],
    label: 'Repriced variants',
    planStepLabel: 'Reprice variants',
    execute: async (input: { prices: string }) => {
      const shop = await loadShopContext(organizationId);
      if (!shop) return toolError('Error: no Shopify integration connected.');
      if (!grantCoversScopes(shop.grantedScopes, REPRICE_SCOPES)) {
        return toolError(missingScopeError(shop.grantedScopes, REPRICE_SCOPES));
      }
      const parsed = parsePricePairs(input.prices);
      if ('error' in parsed) return toolError(parsed.error);
      const payload: SetVariantPricesInput = { prices: parsed.prices };
      return setVariantPrices(payload, shop.shopify);
    },
  });

  return {
    [createFlashSaleTool.name]: createFlashSaleTool,
    [endFlashSaleTool.name]: endFlashSaleTool,
    [setVariantPricesTool.name]: setVariantPricesTool,
  };
}

/**
 * `variantId=price` pairs. A malformed pair is refused rather than skipped: a
 * silently dropped variant is a reprice the merchant thinks happened.
 */
export function parsePricePairs(
  raw: string,
): { prices: { variant_id: string; price: number }[] } | { error: string } {
  const prices: { variant_id: string; price: number }[] = [];
  for (const pair of raw.split(',').map((part) => part.trim()).filter(Boolean)) {
    const separator = pair.lastIndexOf('=');
    if (separator <= 0) {
      return { error: `Error: "${pair}" is not a variantId=price pair, so nothing was repriced.` };
    }
    const variantId = pair.slice(0, separator).trim();
    const price = Number.parseFloat(pair.slice(separator + 1).trim());
    if (!variantId || !Number.isFinite(price) || price < 0) {
      return { error: `Error: "${pair}" is not a variantId=price pair, so nothing was repriced.` };
    }
    prices.push({ variant_id: variantId, price });
  }
  if (prices.length === 0) {
    return { error: 'Error: no variants were named, so nothing was repriced.' };
  }
  return { prices };
}

import { describe, expect, it } from 'vitest';
import { TOOL_DEFINITIONS } from '@shopkeeper/agent/tools';
import { buildOperatorShopTools, parsePricePairs } from './operator-shop-tools.js';

const SHOP_TOOL_NAMES = ['create_flash_sale', 'end_flash_sale', 'set_variant_prices'];

describe('operator shop tools', () => {
  // The reason these live in the gateway rather than the shared registry: a
  // customer conversation must never be able to reach a promotion or a reprice.
  // If one of these ever appears in TOOL_DEFINITIONS, the support planner can
  // draft it from a ticket.
  it('stays out of the shared registry the support planner selects from', () => {
    const registryNames = TOOL_DEFINITIONS.map((definition) => definition.name);

    for (const name of SHOP_TOOL_NAMES) {
      expect(registryNames).not.toContain(name);
    }
  });

  it('exposes exactly the three shop-management tools', () => {
    const tools = buildOperatorShopTools({ organizationId: 'org_1' });

    expect(Object.keys(tools).sort()).toEqual([...SHOP_TOOL_NAMES].sort());
  });

  // Every write here is enumerated. The schema takes IDs and pairs, never a
  // query or a collection, so there is no wildcard to express.
  it('accepts no field that could name a collection or the whole catalog', () => {
    const tools = buildOperatorShopTools({ organizationId: 'org_1' });
    const fields = Object.values(tools).flatMap((tool) => (
      Object.keys(tool.inputSchema.properties ?? {})
    ));

    for (const forbidden of ['query', 'collection', 'collection_id', 'all_products', 'product_type']) {
      expect(fields).not.toContain(forbidden);
    }
  });

  it('requires a duration on every sale it can start', () => {
    const tools = buildOperatorShopTools({ organizationId: 'org_1' });

    expect(tools.create_flash_sale.inputSchema.required).toContain('duration_hours');
    expect(tools.set_variant_prices.inputSchema.required).toContain('revisit_in_hours');
  });
});

describe('parsePricePairs', () => {
  it('reads variantId=price pairs', () => {
    expect(parsePricePairs('gid://shopify/ProductVariant/1=19.99, gid://shopify/ProductVariant/2=5')).toEqual({
      prices: [
        { variant_id: 'gid://shopify/ProductVariant/1', price: 19.99 },
        { variant_id: 'gid://shopify/ProductVariant/2', price: 5 },
      ],
    });
  });

  // Shopify IDs contain no '=', but splitting on the last one is what keeps a
  // future ID format from silently truncating the variant.
  it('splits on the final separator', () => {
    expect(parsePricePairs('gid://x=y/1=10')).toEqual({
      prices: [{ variant_id: 'gid://x=y/1', price: 10 }],
    });
  });

  // A dropped variant is a reprice the merchant thinks happened.
  it('refuses the whole batch when one pair is malformed', () => {
    const result = parsePricePairs('gid://1=10, nonsense');

    expect(result).toEqual({ error: expect.stringContaining('nothing was repriced') });
  });

  it('refuses a negative price', () => {
    expect(parsePricePairs('gid://1=-5')).toEqual({
      error: expect.stringContaining('nothing was repriced'),
    });
  });

  it('refuses an empty list', () => {
    expect(parsePricePairs('  ,  ')).toEqual({
      error: expect.stringContaining('no variants were named'),
    });
  });
});

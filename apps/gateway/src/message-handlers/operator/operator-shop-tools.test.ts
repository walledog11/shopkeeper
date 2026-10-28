import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TOOL_DEFINITIONS } from '@shopkeeper/agent/tools';
import { buildOperatorShopTools, parsePricePairs } from './operator-shop-tools.js';

const findIntegration = vi.hoisted(() => vi.fn());

vi.mock('@shopkeeper/db', () => ({
  db: { integration: { findFirst: findIntegration } },
}));

const SHOP_TOOL_NAMES = [
  'create_flash_sale',
  'end_flash_sale',
  'list_flash_sales',
  'set_variant_prices',
];

describe('operator shop tools', () => {
  beforeEach(() => {
    findIntegration.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });
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

  it('exposes exactly the four shop-management tools', () => {
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

  // A sale still has to expire — Shopify enforces the end date, so a sale with
  // no duration is one nothing ever ends. A reprice is permanent by definition
  // and carries no horizon of its own.
  it('requires a duration on every sale it can start', () => {
    const tools = buildOperatorShopTools({ organizationId: 'org_1' });

    expect(tools.create_flash_sale.inputSchema.required).toContain('duration_hours');
  });

  it('marks flash-sale writes as receipt- and discount-scope-bound', () => {
    const tools = buildOperatorShopTools({ organizationId: 'org_1' });

    expect(tools.create_flash_sale.requiredScopes).toEqual(['write_discounts']);
    expect(tools.create_flash_sale.requiredReceiptVersion).toBe(1);
    expect(tools.end_flash_sale.requiredScopes).toEqual(['write_discounts']);
    expect(tools.end_flash_sale.requiredReceiptVersion).toBe(1);
    expect(tools.end_flash_sale.inputSchema.required).toContain('flash_sale_id');
    expect(tools.list_flash_sales.category).toBe('read');
    expect(tools.list_flash_sales.requiredReceiptVersion).toBeNull();
    expect(tools.set_variant_prices.requiredScopes).toEqual(['write_products']);
    expect(tools.set_variant_prices.requiredReceiptVersion).toBe(1);
  });

  it('returns a typed scope rejection for a variant reprice', async () => {
    findIntegration.mockResolvedValue({
      externalAccountId: 'test-store.myshopify.com',
      accessToken: 'shpat_test',
      metadata: { oauthScopes: [] },
    });
    const tool = buildOperatorShopTools({ organizationId: 'org_1' }).set_variant_prices;
    const result = await tool.execute({ prices: '1=44.00' }, {
      orgId: 'org_1',
      mode: 'execute',
      shopify: {
        shop: 'test-store.myshopify.com',
        accessToken: 'shpat_test',
        operationId: 'operation-reprice-1',
        executionId: 'execution-reprice-1',
      },
    } as never, {} as never, {} as never);

    expect(result.status).toBe('policy_block');
    expect(result.receipt).toEqual(expect.objectContaining({
      tool: 'set_variant_prices',
      outcome: 'rejected',
      code: 'missing_shopify_scope',
    }));
  });

  it('returns a typed scope rejection for an end-sale write', async () => {
    findIntegration.mockResolvedValue({
      externalAccountId: 'test-store.myshopify.com',
      accessToken: 'shpat_test',
      metadata: { oauthScopes: [] },
    });
    const tool = buildOperatorShopTools({ organizationId: 'org_1' }).end_flash_sale;
    const result = await tool.execute({
      flash_sale_id: 'gid://shopify/DiscountAutomaticNode/9',
    }, {
      orgId: 'org_1',
      mode: 'execute',
      shopify: {
        shop: 'test-store.myshopify.com',
        accessToken: 'shpat_test',
        operationId: 'operation-end-1',
        executionId: 'execution-end-1',
      },
    } as never, {} as never, {} as never);

    expect(result.status).toBe('policy_block');
    expect(result.receipt).toEqual(expect.objectContaining({
      tool: 'end_flash_sale',
      outcome: 'rejected',
      operationId: 'operation-end-1',
      executionId: 'execution-end-1',
    }));
  });

  it('lists sales through a read tool without an execution receipt', async () => {
    findIntegration.mockResolvedValue({
      externalAccountId: 'test-store.myshopify.com',
      accessToken: 'shpat_test',
      metadata: { oauthScopes: ['write_discounts'] },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: {
        automaticDiscountNodes: {
          nodes: [{
            id: 'gid://shopify/DiscountAutomaticNode/9',
            automaticDiscount: { title: 'Weekend', status: 'ACTIVE', endsAt: null },
          }],
        },
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } })));

    const tool = buildOperatorShopTools({ organizationId: 'org_1' }).list_flash_sales;
    const result = await tool.execute({}, {} as never, {} as never, {} as never);

    expect(result.status).toBe('ok');
    expect(result.message).toContain('Weekend');
    expect(result.receipt).toBeUndefined();
  });

  it('requires product-read scope only when a sale names variants', async () => {
    findIntegration.mockResolvedValue({
      externalAccountId: 'test-store.myshopify.com',
      accessToken: 'shpat_test',
      metadata: { oauthScopes: ['write_discounts'] },
    });
    const tool = buildOperatorShopTools({ organizationId: 'org_1' }).create_flash_sale;
    const result = await tool.execute({
      applies_to: 'variants',
      variant_ids: 'gid://shopify/ProductVariant/1',
      discount_percentage: 20,
      duration_hours: 2,
    }, {
      orgId: 'org_1',
      mode: 'execute',
      shopify: {
        shop: 'test-store.myshopify.com',
        accessToken: 'shpat_test',
        operationId: 'operation-1',
        executionId: 'execution-1',
      },
    } as never, {} as never, {} as never);

    expect(result.status).toBe('policy_block');
    expect(result.message).toContain('read_products');
    expect(result.receipt).toEqual(expect.objectContaining({
      tool: 'create_flash_sale',
      outcome: 'rejected',
      code: 'missing_shopify_scope',
      operationId: 'operation-1',
      executionId: 'execution-1',
    }));
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

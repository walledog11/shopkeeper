import { NextResponse } from 'next/server';
import { db } from '@shopkeeper/db';
import { NotFoundError } from '@/lib/api/errors';
import { withOrgRoute } from '@/lib/api/route';
import { parseNextPageInfo, shopifyRest, ShopifyRequestError } from '@shopkeeper/agent/shopify';

export const dynamic = 'force-dynamic';

const ORDER_FIELDS = 'id,name,created_at,financial_status,fulfillment_status,total_price,current_total_price,customer,line_items';

export const GET = withOrgRoute(
  {
    context: 'Orders GET',
    errorMessage: 'Failed to fetch orders',
    rateLimit: { key: 'orders:get', limit: 30, windowSecs: 60 },
  },
  async ({ org, request }) => {
    const integration = await db.integration.findFirst({
      where: { organizationId: org.id, platform: 'shopify' },
    });

    if (!integration?.accessToken) {
      throw new NotFoundError('no_integration');
    }

    const shop = integration.externalAccountId;
    const ctx = { shop, accessToken: integration.accessToken };
    const { searchParams } = new URL(request.url);

    const fulfillmentStatus = searchParams.get('fulfillment_status') ?? 'any';
    const financialStatus = searchParams.get('financial_status') ?? 'any';
    const q = searchParams.get('q') ?? '';
    const pageInfo = searchParams.get('page_info') ?? '';
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '25', 10), 50);

    // Build the query , cursor pagination (page_info) and search are mutually exclusive
    let query: Record<string, string | number>;
    if (pageInfo) {
      query = { page_info: pageInfo, limit, fields: ORDER_FIELDS };
    } else if (q) {
      query = q.includes('@')
        ? { status: 'any', limit, fields: ORDER_FIELDS, email: q }
        : { status: 'any', limit, fields: ORDER_FIELDS, name: q.startsWith('#') ? q : `#${q}` };
    } else {
      query = {
        status: 'any',
        limit,
        fields: ORDER_FIELDS,
        ...(fulfillmentStatus !== 'any' ? { fulfillment_status: fulfillmentStatus } : {}),
        ...(financialStatus !== 'any' ? { financial_status: financialStatus } : {}),
      };
    }

    let data: { orders?: ShopifyOrderRaw[] };
    let headers: Headers;
    try {
      ({ data, headers } = await shopifyRest<{ orders?: ShopifyOrderRaw[] }>(ctx, 'orders.json', { query, maxRetries: 0 }));
    } catch (err) {
      if (err instanceof ShopifyRequestError) {
        return NextResponse.json({ error: 'shopify_error', details: err.payload ?? {} }, { status: err.status ?? 502 });
      }
      throw err;
    }

    const orders: ShopifyOrderRaw[] = data.orders ?? [];
    const nextPageInfo = parseNextPageInfo(headers);

    // Normalize to the shape the client needs
    const normalized = orders.map(normalizeOrder);

    return NextResponse.json({ orders: normalized, nextPageInfo, shop });
  },
);

// ── Types & normalization ─────────────────────────────────────────────────────

interface ShopifyOrderRaw {
  id: number;
  name: string;
  created_at: string;
  financial_status: string;
  fulfillment_status: string | null;
  total_price: string;
  current_total_price: string;
  customer: { id: number; first_name: string; last_name: string; email: string } | null;
  line_items: { title: string; quantity: number; current_quantity: number; variant_title: string | null }[];
}

function normalizeOrder(o: ShopifyOrderRaw) {
  return {
    id: o.id,
    name: o.name,
    created_at: o.created_at,
    financial_status: o.financial_status,
    fulfillment_status: o.fulfillment_status,
    total_price: o.current_total_price ?? o.total_price,
    customer: o.customer
      ? {
          id: o.customer.id,
          name: [o.customer.first_name, o.customer.last_name].filter(Boolean).join(' '),
          email: o.customer.email,
        }
      : null,
    line_items: o.line_items.flatMap(li => li.current_quantity > 0 ? [{
        title: li.title,
        quantity: li.current_quantity,
        variant_title: li.variant_title || null,
      }] : []),
  };
}

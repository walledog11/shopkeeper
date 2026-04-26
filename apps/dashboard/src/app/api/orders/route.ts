import { NextResponse } from 'next/server';
import { db } from '@clerk/db';
import { getOrCreateOrg } from '@/lib/server/org';
import { handleApiError } from '@/lib/api/errors';
import { rateLimit, tooManyRequests } from '@/lib/server/rate-limit';

export const dynamic = 'force-dynamic';

const ORDER_FIELDS = 'id,name,created_at,financial_status,fulfillment_status,total_price,current_total_price,customer,line_items';
const API_VERSION = '2024-01';

export async function GET(request: Request) {
  try {
    const org = await getOrCreateOrg();
    const rl = await rateLimit(`orders:get:${org.id}`, 30, 60);
    if (!rl.success) return tooManyRequests(rl.reset);

    const integration = await db.integration.findFirst({
      where: { organizationId: org.id, platform: 'shopify' },
    });

    if (!integration?.accessToken) {
      return NextResponse.json({ error: 'no_integration' }, { status: 404 });
    }

    const { shop, token } = { shop: integration.externalAccountId, token: integration.accessToken };
    const { searchParams } = new URL(request.url);

    const fulfillmentStatus = searchParams.get('fulfillment_status') ?? 'any';
    const financialStatus = searchParams.get('financial_status') ?? 'any';
    const q = searchParams.get('q') ?? '';
    const pageInfo = searchParams.get('page_info') ?? '';
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '25', 10), 50);

    // Build Shopify URL — cursor pagination (page_info) and search are mutually exclusive
    let url: string;
    const base = `https://${shop}/admin/api/${API_VERSION}/orders.json`;
    if (pageInfo) {
      url = `${base}?page_info=${encodeURIComponent(pageInfo)}&limit=${limit}&fields=${ORDER_FIELDS}`;
    } else if (q) {
      if (q.includes('@')) {
        url = `${base}?status=any&limit=${limit}&fields=${ORDER_FIELDS}&email=${encodeURIComponent(q)}`;
      } else {
        const orderName = q.startsWith('#') ? q : `#${q}`;
        url = `${base}?status=any&limit=${limit}&fields=${ORDER_FIELDS}&name=${encodeURIComponent(orderName)}`;
      }
    } else {
      const fsParam = fulfillmentStatus !== 'any' ? `&fulfillment_status=${fulfillmentStatus}` : '';
      const finParam = financialStatus !== 'any' ? `&financial_status=${financialStatus}` : '';
      url = `${base}?status=any&limit=${limit}&fields=${ORDER_FIELDS}${fsParam}${finParam}`;
    }

    const res = await fetch(url, {
      headers: { 'X-Shopify-Access-Token': token },
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return NextResponse.json({ error: 'shopify_error', details: errData }, { status: res.status });
    }

    const data = await res.json();
    const orders: ShopifyOrderRaw[] = data.orders ?? [];

    // Extract next page cursor from Link header
    const linkHeader = res.headers.get('link') ?? '';
    const nextMatch = linkHeader.match(/<[^>]*[?&]page_info=([^&>]+)[^>]*>;\s*rel="next"/);
    const nextPageInfo = nextMatch ? nextMatch[1] : null;

    // Normalize to the shape the client needs
    const normalized = orders.map(normalizeOrder);

    return NextResponse.json({ orders: normalized, nextPageInfo, shop });
  } catch (error) {
    return handleApiError(error, 'Orders GET', 'Failed to fetch orders');
  }
}

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
    line_items: o.line_items
      .filter(li => li.current_quantity > 0)
      .map(li => ({
        title: li.title,
        quantity: li.current_quantity,
        variant_title: li.variant_title || null,
      })),
  };
}

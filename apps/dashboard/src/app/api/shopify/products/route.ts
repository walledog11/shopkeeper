import { NextResponse } from 'next/server';
import { db } from '@clerk/db';
import { NotFoundError } from '@/lib/api/errors';
import { withOrgRoute } from '@/lib/api/route';

export const dynamic = 'force-dynamic';

const PRODUCT_FIELDS = 'id,title,status,vendor,product_type,tags,images,variants';
const API_VERSION = '2026-04';

export const GET = withOrgRoute(
  {
    context: 'Products GET',
    errorMessage: 'Failed to fetch products',
    rateLimit: { key: 'products:get', limit: 30, windowSecs: 60 },
  },
  async ({ org, request }) => {
    const integration = await db.integration.findFirst({
      where: { organizationId: org.id, platform: 'shopify' },
    });

    if (!integration?.accessToken) {
      throw new NotFoundError('no_integration');
    }

    const shop = integration.externalAccountId;
    const token = integration.accessToken;
    const { searchParams } = new URL(request.url);

    const q = searchParams.get('q')?.trim() ?? '';
    const status = searchParams.get('status') ?? 'any';
    const pageInfo = searchParams.get('page_info') ?? '';
    const limit = 25;

    const base = `https://${shop}/admin/api/${API_VERSION}/products.json`;
    const statusParam = status !== 'any' ? `&status=${status}` : '';
    let url: string;

    if (pageInfo) {
      url = `${base}?page_info=${encodeURIComponent(pageInfo)}&limit=${limit}&fields=${PRODUCT_FIELDS}`;
    } else if (q) {
      url = `${base}?title=${encodeURIComponent(q)}&limit=${limit}&fields=${PRODUCT_FIELDS}${statusParam}`;
    } else {
      url = `${base}?limit=${limit}&fields=${PRODUCT_FIELDS}${statusParam}`;
    }

    const res = await fetch(url, {
      cache: 'no-store',
      headers: { 'X-Shopify-Access-Token': token },
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return NextResponse.json({ error: 'shopify_error', details: errData }, { status: res.status });
    }

    const data = await res.json();
    const products: ShopifyProductRaw[] = data.products ?? [];

    const linkHeader = res.headers.get('link') ?? '';
    const nextMatch = linkHeader.match(/<[^>]*[?&]page_info=([^&>]+)[^>]*>;\s*rel="next"/);
    const nextPageInfo = nextMatch ? nextMatch[1] : null;

    return NextResponse.json({ products: products.map(normalizeProduct), nextPageInfo, shop });
  },
);

// ── Types & normalization ─────────────────────────────────────────────────────

interface ShopifyVariantRaw {
  id: number;
  title: string;
  price: string;
  sku: string | null;
  inventory_quantity: number;
  compare_at_price: string | null;
}

interface ShopifyImageRaw {
  src: string;
  alt: string | null;
}

interface ShopifyProductRaw {
  id: number;
  title: string;
  status: string;
  vendor: string;
  product_type: string;
  tags: string;
  images: ShopifyImageRaw[];
  variants: ShopifyVariantRaw[];
}

function normalizeProduct(p: ShopifyProductRaw) {
  const prices = p.variants.flatMap(v => {
    const price = parseFloat(v.price);
    return Number.isNaN(price) ? [] : [price];
  });
  const minPrice = prices.length ? Math.min(...prices) : null;
  const maxPrice = prices.length ? Math.max(...prices) : null;

  const totalInventory = p.variants.reduce((sum, v) => sum + (v.inventory_quantity ?? 0), 0);

  return {
    id: p.id,
    title: p.title,
    status: p.status,
    vendor: p.vendor || null,
    product_type: p.product_type || null,
    tags: p.tags ? p.tags.split(',').flatMap(t => {
      const tag = t.trim();
      return tag ? [tag] : [];
    }) : [],
    image: p.images?.[0]?.src ?? null,
    variant_count: p.variants.length,
    price_min: minPrice,
    price_max: maxPrice,
    total_inventory: totalInventory,
    variants: p.variants.map(v => ({
      id: v.id,
      title: v.title,
      price: v.price,
      sku: v.sku || null,
      inventory_quantity: v.inventory_quantity ?? 0,
      compare_at_price: v.compare_at_price || null,
    })),
  };
}

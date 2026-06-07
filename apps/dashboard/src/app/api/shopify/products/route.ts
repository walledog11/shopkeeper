import { NextResponse } from 'next/server';
import { db } from '@shopkeeper/db';
import { NotFoundError } from '@/lib/api/errors';
import { withOrgRoute } from '@/lib/api/route';
import { parseNextPageInfo, shopifyRest, ShopifyRequestError } from '@shopkeeper/agent/shopify';

export const dynamic = 'force-dynamic';

const PRODUCT_FIELDS = 'id,title,status,vendor,product_type,tags,images,variants';

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
    const ctx = { shop, accessToken: integration.accessToken };
    const { searchParams } = new URL(request.url);

    const q = searchParams.get('q')?.trim() ?? '';
    const status = searchParams.get('status') ?? 'any';
    const pageInfo = searchParams.get('page_info') ?? '';
    const limit = 25;

    const statusParam: Record<string, string> = status !== 'any' ? { status } : {};
    let query: Record<string, string | number>;
    if (pageInfo) {
      query = { page_info: pageInfo, limit, fields: PRODUCT_FIELDS };
    } else if (q) {
      query = { title: q, limit, fields: PRODUCT_FIELDS, ...statusParam };
    } else {
      query = { limit, fields: PRODUCT_FIELDS, ...statusParam };
    }

    let data: { products?: ShopifyProductRaw[] };
    let headers: Headers;
    try {
      ({ data, headers } = await shopifyRest<{ products?: ShopifyProductRaw[] }>(ctx, 'products.json', { query, maxRetries: 0 }));
    } catch (err) {
      if (err instanceof ShopifyRequestError) {
        return NextResponse.json({ error: 'shopify_error', details: err.payload ?? {} }, { status: err.status ?? 502 });
      }
      throw err;
    }

    const products: ShopifyProductRaw[] = data.products ?? [];
    const nextPageInfo = parseNextPageInfo(headers);

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

import { NextResponse } from 'next/server';
import { db } from '@clerk/db';
import { BadRequestError, NotFoundError } from '@/lib/api/errors';
import { withOrgRoute } from '@/lib/api/route';
import { shopifyRestJson, ShopifyRequestError, type ShopifyContext } from '@/lib/agent/shopify';
import logger from '@/lib/server/logger';

function shopifyErrorResponse(err: unknown): NextResponse {
  if (err instanceof ShopifyRequestError) {
    return NextResponse.json({ error: 'shopify_error', details: err.payload ?? {} }, { status: err.status ?? 502 });
  }
  throw err;
}

const CUSTOMER_FIELDS = 'id,first_name,last_name,email,phone,note,orders_count,total_spent,currency,created_at,default_address';

export const GET = withOrgRoute(
  { context: 'Shopify Customer GET', errorMessage: 'server_error' },
  async ({ org, request }) => {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');
    const customerId = searchParams.get('customerId');
    const parsedOrderLimit = Number.parseInt(searchParams.get('orderLimit') ?? '5', 10);
    const orderLimit = Number.isFinite(parsedOrderLimit)
      ? Math.min(Math.max(parsedOrderLimit, 0), 5)
      : 5;

    if (!email && !customerId) {
      throw new BadRequestError('Missing email or customerId');
    }

    const integration = await db.integration.findFirst({
      where: { organizationId: org.id, platform: 'shopify' },
    });

    if (!integration?.accessToken) {
      throw new NotFoundError('no_integration');
    }

    const shop = integration.externalAccountId;
    const ctx: ShopifyContext = { shop, accessToken: integration.accessToken };

    let customer: ShopifyCustomer | null = null;

    try {
      if (customerId) {
        const data = await shopifyRestJson<{ customer?: ShopifyCustomer }>(ctx, `customers/${customerId}.json`, {
          query: { fields: CUSTOMER_FIELDS },
          maxRetries: 0,
        });
        customer = data.customer ?? null;
      } else {
        const data = await shopifyRestJson<{ customers?: ShopifyCustomer[] }>(ctx, 'customers/search.json', {
          query: { query: `email:${email!}`, fields: CUSTOMER_FIELDS },
          maxRetries: 0,
        });
        customer = (data.customers ?? [])[0] ?? null;
      }
    } catch (err) {
      return shopifyErrorResponse(err);
    }

    if (!customer) {
      return NextResponse.json({ customer: null, orders: [] });
    }

    await persistCustomerName(org.id, customer);

    let orders: ShopifyOrder[] = [];
    if (orderLimit > 0) {
      let rawOrders: ShopifyOrder[];
      try {
        const ordersData = await shopifyRestJson<{ orders?: ShopifyOrder[] }>(ctx, 'orders.json', {
          query: {
            customer_id: customer.id,
            status: 'any',
            limit: orderLimit,
            fields: 'id,name,created_at,fulfillment_status,total_price,currency,line_items',
          },
          maxRetries: 0,
        });
        rawOrders = ordersData.orders ?? [];
      } catch (err) {
        return shopifyErrorResponse(err);
      }
      orders = await addProductImagesToOrders(rawOrders, ctx);
    }

    return NextResponse.json({ customer, orders, shop });
  },
);

export const PATCH = withOrgRoute(
  { context: 'Shopify Customer PATCH', errorMessage: 'server_error' },
  async ({ org, request }) => {
    const { customerId, updates } = await request.json();

    if (!customerId || !updates) {
      throw new BadRequestError('Missing customerId or updates');
    }

    const integration = await db.integration.findFirst({
      where: { organizationId: org.id, platform: 'shopify' },
    });

    if (!integration?.accessToken) {
      throw new NotFoundError('no_integration');
    }

    const ctx: ShopifyContext = { shop: integration.externalAccountId, accessToken: integration.accessToken };

    // Build the Shopify customer update payload
    const customerPayload: Record<string, unknown> = {
      id: customerId,
      ...(updates.first_name !== undefined && { first_name: updates.first_name }),
      ...(updates.last_name  !== undefined && { last_name:  updates.last_name  }),
      ...(updates.email      !== undefined && { email:      updates.email      }),
      ...(updates.phone      !== undefined && { phone:      updates.phone      }),
      ...(updates.note       !== undefined && { note:       updates.note       }),
    };

    // Address is updated via the default_address sub-object
    if (updates.address) {
      customerPayload.addresses = [{
        ...(updates.address.address1 !== undefined && { address1: updates.address.address1 }),
        ...(updates.address.city     !== undefined && { city:     updates.address.city     }),
        ...(updates.address.province !== undefined && { province: updates.address.province }),
        ...(updates.address.zip      !== undefined && { zip:      updates.address.zip      }),
        ...(updates.address.country  !== undefined && { country:  updates.address.country  }),
        default: true,
      }];
    }

    let data: { customer?: unknown };
    try {
      data = await shopifyRestJson<{ customer?: unknown }>(ctx, `customers/${customerId}.json`, {
        method: 'PUT',
        maxRetries: 0,
        body: { customer: customerPayload },
      });
    } catch (err) {
      if (err instanceof ShopifyRequestError) {
        logger.error({ err: err.payload }, '[Shopify Customer PATCH] Shopify error');
        const errors = (err.payload as { errors?: unknown } | null)?.errors;
        return NextResponse.json({ error: errors ?? 'Failed to update customer' }, { status: err.status ?? 502 });
      }
      throw err;
    }

    if (!data.customer) {
      logger.error({ err: data }, '[Shopify Customer PATCH] Shopify error');
      return NextResponse.json({ error: 'Failed to update customer' }, { status: 502 });
    }

    return NextResponse.json({ customer: data.customer });
  },
);

// ── Types ─────────────────────────────────────────────────────────────────────

interface ShopifyCustomer {
  id: number;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  note: string | null;
  orders_count: number;
  total_spent: string;
  currency?: string | null;
  created_at: string;
  default_address: ShopifyAddress | null;
}

interface ShopifyAddress {
  id: number;
  address1: string | null;
  city: string | null;
  province: string | null;
  country_name: string | null;
  zip: string | null;
}

interface ShopifyOrder {
  id: number;
  name: string;
  created_at: string;
  fulfillment_status: string | null;
  total_price: string;
  currency?: string | null;
  line_items: ShopifyLineItem[];
}

interface ShopifyLineItem {
  title: string;
  quantity: number;
  product_id: number | null;
  variant_title: string | null;
  sku: string | null;
  image?: string | null;
}

interface ShopifyProductImage {
  src: string;
}

interface ShopifyProduct {
  id: number;
  images: ShopifyProductImage[];
}

async function persistCustomerName(organizationId: string, shopifyCustomer: ShopifyCustomer) {
  const email = shopifyCustomer.email?.trim();
  if (!email) return;

  const fullName = `${shopifyCustomer.first_name ?? ''} ${shopifyCustomer.last_name ?? ''}`.trim();
  if (!fullName) return;

  try {
    const local = await db.customer.findFirst({
      where: { organizationId, platformId: { equals: email, mode: 'insensitive' } },
      select: { id: true, name: true, platformId: true },
    });
    if (!local) return;

    const emailLocal = local.platformId.split('@')[0];
    const isEmailLike = !local.name || local.name === local.platformId || local.name === emailLocal;
    if (!isEmailLike) return;

    await db.customer.update({ where: { id: local.id }, data: { name: fullName } });
  } catch (err) {
    logger.warn({ err, organizationId, email }, '[Shopify Customer GET] Failed to persist customer name');
  }
}

async function addProductImagesToOrders(orders: ShopifyOrder[], ctx: ShopifyContext) {
  const productIds = Array.from(new Set(
    orders.flatMap(order => order.line_items.map(item => item.product_id).filter((id): id is number => typeof id === 'number'))
  ));

  if (productIds.length === 0) return orders;

  try {
    const productsData = await shopifyRestJson<{ products?: ShopifyProduct[] }>(ctx, 'products.json', {
      query: { ids: productIds.join(','), fields: 'id,images' },
      maxRetries: 0,
    });

    const productImageById = new Map<number, string | null>(
      (productsData.products ?? []).map(product => [
        product.id,
        product.images?.[0]?.src ?? null,
      ])
    );

    return orders.map(order => ({
      ...order,
      line_items: order.line_items.map(item => ({
        ...item,
        image: item.product_id ? productImageById.get(item.product_id) ?? null : null,
      })),
    }));
  } catch (err) {
    logger.warn({ err }, '[Shopify Customer GET] Failed to fetch product images');
    return orders;
  }
}

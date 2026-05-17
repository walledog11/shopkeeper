import { NextResponse } from 'next/server';
import { db } from '@clerk/db';
import { getOrCreateOrg } from '@/lib/server/org';
import logger from '@/lib/server/logger';

const CUSTOMER_FIELDS = 'id,first_name,last_name,email,phone,note,orders_count,total_spent,currency,created_at,default_address';

export async function GET(request: Request) {
  try {
    const org = await getOrCreateOrg();
    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');
    const customerId = searchParams.get('customerId');
    const parsedOrderLimit = Number.parseInt(searchParams.get('orderLimit') ?? '5', 10);
    const orderLimit = Number.isFinite(parsedOrderLimit)
      ? Math.min(Math.max(parsedOrderLimit, 0), 5)
      : 5;

    if (!email && !customerId) {
      return NextResponse.json({ error: 'Missing email or customerId' }, { status: 400 });
    }

    const integration = await db.integration.findFirst({
      where: { organizationId: org.id, platform: 'shopify' },
    });

    if (!integration?.accessToken) {
      return NextResponse.json({ error: 'no_integration' }, { status: 404 });
    }

    const shop = integration.externalAccountId;
    const token = integration.accessToken;

    let customer: ShopifyCustomer | null = null;

    if (customerId) {
      const res = await fetch(
        `https://${shop}/admin/api/2026-04/customers/${customerId}.json?fields=${CUSTOMER_FIELDS}`,
        { headers: { 'X-Shopify-Access-Token': token } }
      );
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        return NextResponse.json({ error: 'shopify_error', details: errData }, { status: res.status });
      }
      const data = await res.json();
      customer = data.customer ?? null;
    } else {
      const res = await fetch(
        `https://${shop}/admin/api/2026-04/customers/search.json?query=email:${encodeURIComponent(email!)}&fields=${CUSTOMER_FIELDS}`,
        { headers: { 'X-Shopify-Access-Token': token } }
      );
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        return NextResponse.json({ error: 'shopify_error', details: errData }, { status: res.status });
      }
      const data = await res.json();
      customer = (data.customers ?? [])[0] ?? null;
    }

    if (!customer) {
      return NextResponse.json({ customer: null, orders: [] });
    }

    await persistCustomerName(org.id, customer);

    let orders: ShopifyOrder[] = [];
    if (orderLimit > 0) {
      const ordersRes = await fetch(
        `https://${shop}/admin/api/2026-04/orders.json?customer_id=${customer.id}&status=any&limit=${orderLimit}&fields=id,name,created_at,fulfillment_status,total_price,currency,line_items`,
        { headers: { 'X-Shopify-Access-Token': token } }
      );
      if (!ordersRes.ok) {
        const errData = await ordersRes.json().catch(() => ({}));
        return NextResponse.json({ error: 'shopify_error', details: errData }, { status: ordersRes.status });
      }
      const ordersData = await ordersRes.json();
      const rawOrders: ShopifyOrder[] = ordersData.orders ?? [];
      orders = await addProductImagesToOrders(rawOrders, shop, token);
    }

    return NextResponse.json({ customer, orders, shop });

  } catch (err) {
    logger.error({ err }, '[Shopify Customer GET] Error');
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const org = await getOrCreateOrg();
    const { customerId, updates } = await request.json();

    if (!customerId || !updates) {
      return NextResponse.json({ error: 'Missing customerId or updates' }, { status: 400 });
    }

    const integration = await db.integration.findFirst({
      where: { organizationId: org.id, platform: 'shopify' },
    });

    if (!integration?.accessToken) {
      return NextResponse.json({ error: 'no_integration' }, { status: 404 });
    }

    const shop = integration.externalAccountId;
    const token = integration.accessToken;

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

    const res = await fetch(`https://${shop}/admin/api/2026-04/customers/${customerId}.json`, {
      method: 'PUT',
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ customer: customerPayload }),
    });

    const data = await res.json();

    if (!res.ok || !data.customer) {
      logger.error({ err: data }, '[Shopify Customer PATCH] Shopify error');
      return NextResponse.json({ error: data.errors ?? 'Failed to update customer' }, { status: res.status });
    }

    return NextResponse.json({ customer: data.customer });

  } catch (err) {
    logger.error({ err }, '[Shopify Customer PATCH] Error');
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}

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

async function addProductImagesToOrders(orders: ShopifyOrder[], shop: string, token: string) {
  const productIds = Array.from(new Set(
    orders.flatMap(order => order.line_items.map(item => item.product_id).filter((id): id is number => typeof id === 'number'))
  ));

  if (productIds.length === 0) return orders;

  try {
    const productsRes = await fetch(
      `https://${shop}/admin/api/2026-04/products.json?ids=${productIds.join(',')}&fields=id,images`,
      { headers: { 'X-Shopify-Access-Token': token } }
    );

    if (!productsRes.ok) return orders;

    const productsData = await productsRes.json();
    const productImageById = new Map<number, string | null>(
      ((productsData.products ?? []) as ShopifyProduct[]).map(product => [
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

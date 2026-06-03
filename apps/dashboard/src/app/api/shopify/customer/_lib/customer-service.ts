import { db } from '@clerk/db';
import { NotFoundError } from '@/lib/api/errors';
import { shopifyRestJson, type ShopifyContext } from '@/lib/agent/shopify';
import logger from '@/lib/server/logger';

const CUSTOMER_FIELDS = 'id,first_name,last_name,email,phone,note,orders_count,total_spent,currency,created_at,default_address';

export interface ShopifyCustomerLookupInput {
  organizationId: string;
  email: string | null;
  customerId: string | null;
  orderLimit: number;
}

export interface ShopifyCustomerLookupResult {
  customer: ShopifyCustomer | null;
  orders: ShopifyOrder[];
  shop?: string;
}

export interface ShopifyCustomerUpdates {
  first_name?: unknown;
  last_name?: unknown;
  email?: unknown;
  phone?: unknown;
  note?: unknown;
  address?: {
    address1?: unknown;
    city?: unknown;
    province?: unknown;
    zip?: unknown;
    country?: unknown;
  };
}

export async function lookupShopifyCustomer({
  organizationId,
  email,
  customerId,
  orderLimit,
}: ShopifyCustomerLookupInput): Promise<ShopifyCustomerLookupResult> {
  const { shop, ctx } = await getShopifyContext(organizationId);
  const customer = await findShopifyCustomer(ctx, { email, customerId });

  if (!customer) {
    return { customer: null, orders: [] };
  }

  await persistCustomerName(organizationId, customer);

  const orders = orderLimit > 0
    ? await getCustomerOrdersWithImages(ctx, customer.id, orderLimit)
    : [];

  return { customer, orders, shop };
}

export async function updateShopifyCustomer(
  organizationId: string,
  customerId: string | number,
  updates: ShopifyCustomerUpdates,
): Promise<unknown | null> {
  const { ctx } = await getShopifyContext(organizationId);
  const customerPayload = buildShopifyCustomerPayload(customerId, updates);

  const data = await shopifyRestJson<{ customer?: unknown }>(ctx, `customers/${customerId}.json`, {
    method: 'PUT',
    maxRetries: 0,
    body: { customer: customerPayload },
  });

  return data.customer ?? null;
}

async function getShopifyContext(organizationId: string): Promise<{ shop: string; ctx: ShopifyContext }> {
  const integration = await db.integration.findFirst({
    where: { organizationId, platform: 'shopify' },
  });

  if (!integration?.accessToken) {
    throw new NotFoundError('no_integration');
  }

  const shop = integration.externalAccountId;
  return { shop, ctx: { shop, accessToken: integration.accessToken } };
}

async function findShopifyCustomer(
  ctx: ShopifyContext,
  input: { email: string | null; customerId: string | null },
): Promise<ShopifyCustomer | null> {
  if (input.customerId) {
    const data = await shopifyRestJson<{ customer?: ShopifyCustomer }>(ctx, `customers/${input.customerId}.json`, {
      query: { fields: CUSTOMER_FIELDS },
      maxRetries: 0,
    });
    return data.customer ?? null;
  }

  const data = await shopifyRestJson<{ customers?: ShopifyCustomer[] }>(ctx, 'customers/search.json', {
    query: { query: `email:${input.email!}`, fields: CUSTOMER_FIELDS },
    maxRetries: 0,
  });
  return (data.customers ?? [])[0] ?? null;
}

async function getCustomerOrdersWithImages(
  ctx: ShopifyContext,
  customerId: number,
  orderLimit: number,
): Promise<ShopifyOrder[]> {
  const ordersData = await shopifyRestJson<{ orders?: ShopifyOrder[] }>(ctx, 'orders.json', {
    query: {
      customer_id: customerId,
      status: 'any',
      limit: orderLimit,
      fields: 'id,name,created_at,fulfillment_status,total_price,currency,line_items',
    },
    maxRetries: 0,
  });

  return addProductImagesToOrders(ordersData.orders ?? [], ctx);
}

function buildShopifyCustomerPayload(
  customerId: string | number,
  updates: ShopifyCustomerUpdates,
): Record<string, unknown> {
  const customerPayload: Record<string, unknown> = {
    id: customerId,
    ...(updates.first_name !== undefined && { first_name: updates.first_name }),
    ...(updates.last_name !== undefined && { last_name: updates.last_name }),
    ...(updates.email !== undefined && { email: updates.email }),
    ...(updates.phone !== undefined && { phone: updates.phone }),
    ...(updates.note !== undefined && { note: updates.note }),
  };

  if (updates.address) {
    customerPayload.addresses = [{
      ...(updates.address.address1 !== undefined && { address1: updates.address.address1 }),
      ...(updates.address.city !== undefined && { city: updates.address.city }),
      ...(updates.address.province !== undefined && { province: updates.address.province }),
      ...(updates.address.zip !== undefined && { zip: updates.address.zip }),
      ...(updates.address.country !== undefined && { country: updates.address.country }),
      default: true,
    }];
  }

  return customerPayload;
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
    orders.flatMap(order => order.line_items.map(item => item.product_id).filter((id): id is number => typeof id === 'number')),
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
      ]),
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

export interface ShopifyCustomer {
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

export interface ShopifyAddress {
  id: number;
  address1: string | null;
  city: string | null;
  province: string | null;
  country_name: string | null;
  zip: string | null;
}

export interface ShopifyOrder {
  id: number;
  name: string;
  created_at: string;
  fulfillment_status: string | null;
  total_price: string;
  currency?: string | null;
  line_items: ShopifyLineItem[];
}

export interface ShopifyLineItem {
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

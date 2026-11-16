import { db } from '@shopkeeper/db';
import { NotFoundError } from '@/lib/api/errors';
import {
  fetchShopifyCustomer,
  fetchShopifyCustomerDefaultAddress,
  findShopifyCustomerByEmail,
  findShopifyOrders,
  formatUserErrors,
  saveShopifyCustomerDefaultAddress,
  updateShopifyCustomerRecord,
  type ShopifyContext,
  type ShopifyCustomerFields,
} from '@shopkeeper/agent/shopify';
import { SHOPIFY_ACCESS_SELECT, shopifyContextFor } from '@shopkeeper/agent/shopify/access';
import { markShopifyIntegrationInvalidIfAuthFailure } from '@/lib/server/shopify-integration';
import type { ShopifyCustomer, ShopifyOrder } from '@/types/shopify';
import logger from '@/lib/server/logger';

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

interface ResolvedShopifyContext {
  shop: string;
  ctx: ShopifyContext;
  integrationId: string;
}

export async function lookupShopifyCustomer({
  organizationId,
  email,
  customerId,
  orderLimit,
}: ShopifyCustomerLookupInput): Promise<ShopifyCustomerLookupResult> {
  const shopifyContext = await getShopifyContext(organizationId);
  const customer = await runShopifyCallWithContext(
    organizationId,
    shopifyContext,
    (ctx) => findShopifyCustomer(ctx, { email, customerId }),
  );

  if (!customer) {
    return { customer: null, orders: [] };
  }

  await persistCustomerName(organizationId, customer);

  const orders = orderLimit > 0
    ? await runShopifyCallWithContext(
      organizationId,
      shopifyContext,
      (ctx) => getCustomerOrdersWithImages(ctx, customer.id, orderLimit),
    )
    : [];

  return { customer, orders, shop: shopifyContext.shop };
}

/** The saved customer as the panel shows it, or Shopify's reasons for refusing the change. */
export type ShopifyCustomerUpdateResult = { customer: ShopifyCustomer } | { rejected: string };

export async function updateShopifyCustomer(
  organizationId: string,
  customerId: string | number,
  updates: ShopifyCustomerUpdates,
): Promise<ShopifyCustomerUpdateResult | null> {
  const id = String(customerId);
  return runShopifyCall(organizationId, async (ctx) => {
    const record = await updateShopifyCustomerRecord(ctx, id, customerFields(updates));
    const rejected = formatUserErrors(record.userErrors);
    if (rejected) return { rejected };

    const address = defaultAddressFields(updates.address);
    if (address) {
      const current = await fetchShopifyCustomerDefaultAddress(ctx, id);
      const saved = await saveShopifyCustomerDefaultAddress(ctx, id, current?.gid ?? null, address);
      const addressRejected = formatUserErrors(saved.userErrors);
      if (addressRejected) return { rejected: addressRejected };
    }

    const customer = await fetchShopifyCustomer(ctx, id, { maxRetries: 0 });
    return customer ? { customer: panelCustomer(customer) } : null;
  });
}

async function getShopifyContext(organizationId: string): Promise<ResolvedShopifyContext> {
  const integration = await db.integration.findFirst({
    where: { organizationId, platform: 'shopify' },
    select: SHOPIFY_ACCESS_SELECT,
  });
  const ctx = integration ? await shopifyContextFor(integration) : null;
  if (!integration || !ctx) {
    throw new NotFoundError('no_integration');
  }

  return { shop: ctx.shop, ctx, integrationId: integration.id };
}

async function runShopifyCall<T>(
  organizationId: string,
  fn: (ctx: ShopifyContext) => Promise<T>,
): Promise<T> {
  const shopifyContext = await getShopifyContext(organizationId);
  return runShopifyCallWithContext(organizationId, shopifyContext, fn);
}

async function runShopifyCallWithContext<T>(
  organizationId: string,
  { ctx, integrationId }: ResolvedShopifyContext,
  fn: (ctx: ShopifyContext) => Promise<T>,
): Promise<T> {
  try {
    return await fn(ctx);
  } catch (err) {
    await markShopifyIntegrationInvalidIfAuthFailure(integrationId, organizationId, err);
    throw err;
  }
}

type AgentCustomer = NonNullable<Awaited<ReturnType<typeof fetchShopifyCustomer>>>;

function panelCustomer(customer: AgentCustomer): ShopifyCustomer {
  return {
    id: Number(customer.id),
    first_name: customer.first_name ?? null,
    last_name: customer.last_name ?? null,
    email: customer.email ?? null,
    phone: customer.phone ?? null,
    note: customer.note ?? null,
    orders_count: customer.orders_count ?? 0,
    total_spent: customer.total_spent ?? '0',
    currency: customer.currency ?? null,
    created_at: customer.created_at,
    default_address: customer.default_address
      ? {
          address1: customer.default_address.address1 ?? null,
          city: customer.default_address.city ?? null,
          province: customer.default_address.province ?? null,
          country_name: customer.default_address.country_name ?? customer.default_address.country ?? null,
          zip: customer.default_address.zip ?? null,
        }
      : null,
  };
}

async function findShopifyCustomer(
  ctx: ShopifyContext,
  input: { email: string | null; customerId: string | null },
): Promise<ShopifyCustomer | null> {
  const customerId = input.customerId
    ?? (await findShopifyCustomerByEmail(ctx, input.email!, { maxRetries: 0 }))?.id;
  const customer = customerId ? await fetchShopifyCustomer(ctx, customerId, { maxRetries: 0 }) : null;
  return customer ? panelCustomer(customer) : null;
}

async function getCustomerOrdersWithImages(
  ctx: ShopifyContext,
  customerId: number,
  orderLimit: number,
): Promise<ShopifyOrder[]> {
  const { orders } = await findShopifyOrders(ctx, { customerId }, { first: orderLimit, lineItems: 20, maxRetries: 0 });
  return orders.map(order => ({
    id: Number(order.id),
    name: order.name ?? '',
    created_at: order.created_at ?? '',
    fulfillment_status: order.fulfillment_status ?? null,
    total_price: order.total_price ?? '0',
    currency: order.currency ?? null,
    line_items: (order.line_items ?? []).map(item => ({
      title: item.title,
      quantity: item.quantity,
      variant_title: item.variant_title ?? null,
      sku: item.sku ?? null,
      image: item.image_url ?? null,
    })),
  }));
}

// A field the panel sent: text, or null to clear it. Anything else is left alone.
function textOrNull(value: unknown): string | null | undefined {
  return typeof value === 'string' || value === null ? value : undefined;
}

function customerFields(updates: ShopifyCustomerUpdates): ShopifyCustomerFields {
  return Object.fromEntries(Object.entries({
    first_name: textOrNull(updates.first_name),
    last_name: textOrNull(updates.last_name),
    email: textOrNull(updates.email),
    phone: textOrNull(updates.phone),
    note: textOrNull(updates.note),
  }).filter(([, value]) => value !== undefined));
}

// The panel sends the address with every save; an empty one is not an address.
function defaultAddressFields(address: ShopifyCustomerUpdates['address']): Record<string, string> | null {
  if (!address) return null;
  const fields = Object.fromEntries(Object.entries({
    address1: address.address1,
    city: address.city,
    province: address.province,
    zip: address.zip,
    country: address.country,
  }).flatMap(([name, value]) => (typeof value === 'string' && value.trim() ? [[name, value.trim()]] : [])));
  return Object.keys(fields).length > 0 ? fields : null;
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

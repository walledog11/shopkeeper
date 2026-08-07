import { db } from '@shopkeeper/db';
import { parseNextPageInfo, shopifyRest } from '@shopkeeper/agent/shopify';
import { shopifyRouteErrorResponse } from '@/lib/server/shopify-integration';

const CUSTOMER_LIST_FIELDS = 'id,first_name,last_name,email,phone,orders_count,total_spent,created_at,default_address';

export interface InboxCustomerRecord {
  id: string;
  name: string | null;
  platformId: string;
  profilePicUrl: string | null;
  createdAt: Date;
  threadCount: number;
  lastMessageAt: Date | null;
  channels: string[];
  shopifyCustomerId: string | null;
}

export interface ShopifyCustomerRecord {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  orders_count: number;
  total_spent: string;
  created_at: string;
  default_address: unknown;
}

function normalizeEmail(value: string | null | undefined): string | null {
  const email = value?.trim().toLowerCase() ?? '';
  return email.includes('@') ? email : null;
}

function splitName(name: string | null | undefined, platformId: string) {
  const label = name?.trim() || platformId;
  const parts = label.split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return { first_name: '', last_name: '' };
  }
  if (parts.length === 1) {
    return { first_name: parts[0], last_name: '' };
  }
  return {
    first_name: parts[0],
    last_name: parts.slice(1).join(' '),
  };
}

export async function loadInboxCustomers(organizationId: string, query: string): Promise<InboxCustomerRecord[]> {
  const customers = await db.customer.findMany({
    where: {
      organizationId,
      deletedAt: null,
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: 'insensitive' } },
              { platformId: { contains: query, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      name: true,
      platformId: true,
      profilePicUrl: true,
      createdAt: true,
      threads: {
        where: { deletedAt: null },
        select: {
          channelType: true,
          lastMessageAt: true,
          shopifyCustomerId: true,
        },
        orderBy: { lastMessageAt: 'desc' },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return customers.map((customer) => {
    const channels = [...new Set(customer.threads.map(thread => thread.channelType))];
    const lastMessageAt = customer.threads[0]?.lastMessageAt ?? null;
    const shopifyCustomerId = customer.threads.find(thread => thread.shopifyCustomerId)?.shopifyCustomerId ?? null;
    return {
      id: customer.id,
      name: customer.name,
      platformId: customer.platformId,
      profilePicUrl: customer.profilePicUrl,
      createdAt: customer.createdAt,
      threadCount: customer.threads.length,
      lastMessageAt,
      channels,
      shopifyCustomerId,
    };
  });
}

export async function loadShopifyCustomers(
  organizationId: string,
  request: Request,
): Promise<{ customers: ShopifyCustomerRecord[]; nextPageInfo: string | null; shop: string } | null> {
  const integration = await db.integration.findFirst({
    where: { organizationId, platform: 'shopify' },
  });
  if (!integration?.accessToken) return null;

  const shop = integration.externalAccountId;
  const ctx = { shop, accessToken: integration.accessToken };
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q')?.trim() ?? '';
  const pageInfo = searchParams.get('page_info') ?? '';
  const limit = 25;

  let path: string;
  let query: Record<string, string | number>;
  if (pageInfo) {
    path = 'customers.json';
    query = { page_info: pageInfo, limit, fields: CUSTOMER_LIST_FIELDS };
  } else if (q.length >= 1) {
    path = 'customers/search.json';
    query = { query: q, limit, fields: CUSTOMER_LIST_FIELDS };
  } else {
    path = 'customers.json';
    query = { limit, fields: CUSTOMER_LIST_FIELDS, order: 'updated_at DESC' };
  }

  try {
    const { data, headers } = await shopifyRest<{ customers?: ShopifyCustomerRecord[] }>(ctx, path, {
      query,
      maxRetries: 0,
    });
    return {
      customers: data.customers ?? [],
      nextPageInfo: parseNextPageInfo(headers),
      shop,
    };
  } catch (err) {
    const response = await shopifyRouteErrorResponse(err, integration, organizationId);
    if (response) {
      throw response;
    }
    throw err;
  }
}

export interface UnifiedCustomerRow {
  source: 'shopify' | 'inbox';
  id: string;
  inboxCustomerId: string | null;
  shopifyCustomerId: number | null;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  orders_count: number;
  total_spent: string;
  created_at: string;
  default_address: ShopifyCustomerRecord['default_address'];
  threadCount: number;
  channels: string[];
  lastMessageAt: string | null;
}

function inboxRow(customer: InboxCustomerRecord): UnifiedCustomerRow {
  const email = normalizeEmail(customer.platformId) ?? customer.platformId;
  const names = splitName(customer.name, customer.platformId);
  return {
    source: 'inbox',
    id: customer.id,
    inboxCustomerId: customer.id,
    shopifyCustomerId: customer.shopifyCustomerId ? Number(customer.shopifyCustomerId) : null,
    first_name: names.first_name,
    last_name: names.last_name,
    email,
    phone: null,
    orders_count: 0,
    total_spent: '0',
    created_at: customer.createdAt.toISOString(),
    default_address: null,
    threadCount: customer.threadCount,
    channels: customer.channels,
    lastMessageAt: customer.lastMessageAt?.toISOString() ?? null,
  };
}

function shopifyRow(customer: ShopifyCustomerRecord, inbox?: InboxCustomerRecord): UnifiedCustomerRow {
  return {
    source: 'shopify',
    id: String(customer.id),
    inboxCustomerId: inbox?.id ?? null,
    shopifyCustomerId: customer.id,
    first_name: customer.first_name ?? '',
    last_name: customer.last_name ?? '',
    email: customer.email ?? '',
    phone: customer.phone ?? null,
    orders_count: customer.orders_count ?? 0,
    total_spent: customer.total_spent ?? '0',
    created_at: customer.created_at,
    default_address: customer.default_address,
    threadCount: inbox?.threadCount ?? 0,
    channels: inbox?.channels ?? [],
    lastMessageAt: inbox?.lastMessageAt?.toISOString() ?? null,
  };
}

export function mergeCustomerDirectory(
  inboxCustomers: InboxCustomerRecord[],
  shopifyCustomers: ShopifyCustomerRecord[],
): UnifiedCustomerRow[] {
  const inboxByEmail = new Map<string, InboxCustomerRecord>();
  const inboxByShopifyId = new Map<string, InboxCustomerRecord>();

  for (const customer of inboxCustomers) {
    const email = normalizeEmail(customer.platformId);
    if (email) inboxByEmail.set(email, customer);
    if (customer.shopifyCustomerId) inboxByShopifyId.set(customer.shopifyCustomerId, customer);
  }

  const merged: UnifiedCustomerRow[] = [];
  const consumedInboxIds = new Set<string>();

  for (const customer of shopifyCustomers) {
    const email = normalizeEmail(customer.email);
    const inbox = (email ? inboxByEmail.get(email) : undefined)
      ?? (customer.id ? inboxByShopifyId.get(String(customer.id)) : undefined);
    if (inbox) consumedInboxIds.add(inbox.id);
    merged.push(shopifyRow(customer, inbox));
  }

  for (const customer of inboxCustomers) {
    if (consumedInboxIds.has(customer.id)) continue;
    merged.push(inboxRow(customer));
  }

  return merged.sort((left, right) => {
    const leftActivity = left.lastMessageAt ?? left.created_at;
    const rightActivity = right.lastMessageAt ?? right.created_at;
    return rightActivity.localeCompare(leftActivity);
  });
}

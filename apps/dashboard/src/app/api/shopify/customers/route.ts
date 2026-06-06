import { NextResponse } from 'next/server';
import { db } from '@clerk/db';
import { readRequiredJsonObject } from '@/lib/api/body';
import { NotFoundError } from '@/lib/api/errors';
import { withOrgRoute } from '@/lib/api/route';
import { parseCreateShopifyCustomerBody } from '@/app/api/shopify/customer/_lib/validation';
import { parseNextPageInfo, shopifyRest, shopifyRestJson, ShopifyRequestError } from '@clerk/agent/shopify';

const CUSTOMER_LIST_FIELDS = 'id,first_name,last_name,email,phone,orders_count,total_spent,created_at,default_address';

export const GET = withOrgRoute(
  {
    context: 'Customers GET',
    errorMessage: 'Failed to fetch customers',
    rateLimit: { key: 'customers:get', limit: 30, windowSecs: 60 },
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
    const pageInfo = searchParams.get('page_info') ?? '';
    const limit = 25;

    // Search endpoint has no cursor pagination; the list endpoint returns a Link header.
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

    let data: { customers?: unknown[] };
    let headers: Headers;
    try {
      ({ data, headers } = await shopifyRest<{ customers?: unknown[] }>(ctx, path, { query, maxRetries: 0 }));
    } catch (err) {
      if (err instanceof ShopifyRequestError) {
        return NextResponse.json({ error: 'shopify_error', details: err.payload ?? {} }, { status: err.status ?? 502 });
      }
      throw err;
    }

    return NextResponse.json({ customers: data.customers ?? [], nextPageInfo: parseNextPageInfo(headers), shop });
  },
);

export const POST = withOrgRoute(
  { context: 'Shopify Customer POST', errorMessage: 'server_error' },
  async ({ org, request }) => {
    const { first_name, last_name, email } = parseCreateShopifyCustomerBody(await readRequiredJsonObject(request));
    const integration = await db.integration.findFirst({
      where: { organizationId: org.id, platform: 'shopify' },
    });

    if (!integration?.accessToken) {
      throw new NotFoundError('no_integration');
    }

    const ctx = { shop: integration.externalAccountId, accessToken: integration.accessToken };

    let data: { customer?: unknown };
    try {
      data = await shopifyRestJson<{ customer?: unknown }>(ctx, 'customers.json', {
        method: 'POST',
        maxRetries: 0,
        body: {
          customer: {
            first_name: first_name || '',
            last_name: last_name || '',
            email: email || undefined,
          },
        },
      });
    } catch (err) {
      if (err instanceof ShopifyRequestError) {
        const errors = (err.payload as { errors?: unknown } | null)?.errors;
        return NextResponse.json({ error: errors ?? 'Failed to create customer' }, { status: err.status ?? 502 });
      }
      throw err;
    }

    if (!data.customer) {
      return NextResponse.json({ error: 'Failed to create customer' }, { status: 502 });
    }

    return NextResponse.json({ customer: data.customer });
  },
);

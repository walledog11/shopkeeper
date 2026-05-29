import { NextResponse } from 'next/server';
import { db } from '@clerk/db';
import { NotFoundError } from '@/lib/api/errors';
import { withOrgRoute } from '@/lib/api/route';

const CUSTOMER_LIST_FIELDS = 'id,first_name,last_name,email,phone,orders_count,total_spent,created_at,default_address';
const API_VERSION = '2026-04';

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
    const token = integration.accessToken;
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q')?.trim() ?? '';
    const pageInfo = searchParams.get('page_info') ?? '';
    const limit = 25;

    let url: string;
    const base = `https://${shop}/admin/api/${API_VERSION}`;

    if (pageInfo) {
      url = `${base}/customers.json?page_info=${encodeURIComponent(pageInfo)}&limit=${limit}&fields=${CUSTOMER_LIST_FIELDS}`;
    } else if (q.length >= 1) {
      // Search endpoint , no cursor pagination supported by Shopify
      url = `${base}/customers/search.json?query=${encodeURIComponent(q)}&limit=${limit}&fields=${CUSTOMER_LIST_FIELDS}`;
    } else {
      url = `${base}/customers.json?limit=${limit}&fields=${CUSTOMER_LIST_FIELDS}&order=updated_at+DESC`;
    }

    const res = await fetch(url, { cache: 'no-store', headers: { 'X-Shopify-Access-Token': token } });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return NextResponse.json({ error: 'shopify_error', details: errData }, { status: res.status });
    }

    const data = await res.json();
    const customers = data.customers ?? [];

    // Extract next cursor from Link header (only available on list endpoint, not search)
    const linkHeader = res.headers.get('link') ?? '';
    const nextMatch = linkHeader.match(/<[^>]*[?&]page_info=([^&>]+)[^>]*>;\s*rel="next"/);
    const nextPageInfo = nextMatch ? nextMatch[1] : null;

    return NextResponse.json({ customers, nextPageInfo, shop });
  },
);

export const POST = withOrgRoute(
  { context: 'Shopify Customer POST', errorMessage: 'server_error' },
  async ({ org, request }) => {
    const [{ first_name, last_name, email }, integration] = await Promise.all([
      request.json(),
      db.integration.findFirst({
        where: { organizationId: org.id, platform: 'shopify' },
      }),
    ]);

    if (!integration?.accessToken) {
      throw new NotFoundError('no_integration');
    }

    const shop = integration.externalAccountId;
    const token = integration.accessToken;

    const res = await fetch(`https://${shop}/admin/api/${API_VERSION}/customers.json`, {
      cache: 'no-store',
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        customer: {
          first_name: first_name || '',
          last_name: last_name || '',
          email: email || undefined,
        },
      }),
    });

    const data = await res.json();

    if (!res.ok || !data.customer) {
      return NextResponse.json({ error: data.errors ?? 'Failed to create customer' }, { status: res.status });
    }

    return NextResponse.json({ customer: data.customer });
  },
);

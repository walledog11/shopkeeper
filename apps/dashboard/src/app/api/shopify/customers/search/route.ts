import { NextResponse } from 'next/server';
import { db } from '@clerk/db';
import { NotFoundError } from '@/lib/api/errors';
import { withOrgRoute } from '@/lib/api/route';
import { shopifyRestJson, ShopifyRequestError } from '@clerk/agent/shopify';

export const GET = withOrgRoute(
  { context: 'Shopify Customer Search', errorMessage: 'server_error' },
  async ({ org, request }) => {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q')?.trim();

    if (!q || q.length < 2) {
      return NextResponse.json({ customers: [] });
    }

    const integration = await db.integration.findFirst({
      where: { organizationId: org.id, platform: 'shopify' },
    });

    if (!integration?.accessToken) {
      throw new NotFoundError('no_integration');
    }

    const ctx = { shop: integration.externalAccountId, accessToken: integration.accessToken };

    let data: { customers?: unknown[] };
    try {
      data = await shopifyRestJson<{ customers?: unknown[] }>(ctx, 'customers/search.json', {
        query: { query: q, limit: 8, fields: 'id,first_name,last_name,email' },
        maxRetries: 0,
      });
    } catch (err) {
      if (err instanceof ShopifyRequestError) {
        return NextResponse.json({ error: 'shopify_error', details: err.payload ?? {} }, { status: err.status ?? 502 });
      }
      throw err;
    }

    return NextResponse.json({ customers: data.customers ?? [] });
  },
);

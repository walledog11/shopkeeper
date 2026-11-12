import { NextResponse } from 'next/server';
import { db } from '@shopkeeper/db';
import { readRequiredJsonObject } from '@/lib/api/body';
import { BadRequestError, NotFoundError } from '@/lib/api/errors';
import { withOrgRoute } from '@/lib/api/route';
import { parseCreateShopifyCustomerBody } from '@/app/api/shopify/customer/_lib/validation';
import { searchShopifyCustomers, shopifyRestJson } from '@shopkeeper/agent/shopify';
import { SHOPIFY_ACCESS_SELECT, shopifyContextFor } from '@shopkeeper/agent/shopify/access';
import { shopifyRouteErrorResponse } from '@/lib/server/shopify-integration';
import { decodeShopifyPageToken, encodeShopifyPageToken } from '@/lib/server/shopify-page-token';

export const GET = withOrgRoute(
  {
    context: 'Customers GET',
    errorMessage: 'Failed to fetch customers',
    rateLimit: { key: 'customers:get', limit: 30, windowSecs: 60 },
    customerData: { resource: 'shopify_customer' },
  },
  async ({ org, request }) => {
    const integration = await db.integration.findFirst({
      where: { organizationId: org.id, platform: 'shopify' },
      select: SHOPIFY_ACCESS_SELECT,
    });
    const ctx = integration ? await shopifyContextFor(integration) : null;
    if (!integration || !ctx) {
      throw new NotFoundError('no_integration');
    }

    const { shop } = ctx;
    const { searchParams } = new URL(request.url);
    const pageInfo = searchParams.get('page_info') ?? '';
    const page = pageInfo ? decodeShopifyPageToken(pageInfo) : null;
    if (pageInfo && !page) throw new BadRequestError('page_info is not a cursor this API issued');
    const q = page ? page.query : (searchParams.get('q')?.trim() ?? '');

    let result: Awaited<ReturnType<typeof searchShopifyCustomers>>;
    try {
      result = await searchShopifyCustomers(ctx, q, { first: 25, after: page?.after ?? null, maxRetries: 0 });
    } catch (err) {
      const response = await shopifyRouteErrorResponse(err, integration, org.id);
      if (response) return response;
      throw err;
    }

    const nextPageInfo = result.nextCursor ? encodeShopifyPageToken({ query: q, after: result.nextCursor }) : null;
    return NextResponse.json({ customers: result.customers, nextPageInfo, shop });
  },
);

export const POST = withOrgRoute(
  { context: 'Shopify Customer POST', errorMessage: 'server_error', requireBillingWriteAllowed: true },
  async ({ org, request }) => {
    const { first_name, last_name, email } = parseCreateShopifyCustomerBody(await readRequiredJsonObject(request));
    const integration = await db.integration.findFirst({
      where: { organizationId: org.id, platform: 'shopify' },
      select: SHOPIFY_ACCESS_SELECT,
    });
    const ctx = integration ? await shopifyContextFor(integration) : null;
    if (!integration || !ctx) {
      throw new NotFoundError('no_integration');
    }

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
      const response = await shopifyRouteErrorResponse(err, integration, org.id);
      if (response) return response;
      throw err;
    }

    if (!data.customer) {
      return NextResponse.json({ error: 'Failed to create customer' }, { status: 502 });
    }

    return NextResponse.json({ customer: data.customer });
  },
);

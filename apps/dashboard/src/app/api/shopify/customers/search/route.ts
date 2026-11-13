import { NextResponse } from 'next/server';
import { db } from '@shopkeeper/db';
import { NotFoundError } from '@/lib/api/errors';
import { withOrgRoute } from '@/lib/api/route';
import { searchShopifyCustomerIdentities } from '@shopkeeper/agent/shopify';
import { SHOPIFY_ACCESS_SELECT, shopifyContextFor } from '@shopkeeper/agent/shopify/access';
import { shopifyRouteErrorResponse } from '@/lib/server/shopify-integration';

export const GET = withOrgRoute(
  { context: 'Shopify Customer Search', errorMessage: 'server_error', customerData: { resource: 'shopify_customer' } },
  async ({ org, request }) => {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q')?.trim();

    if (!q || q.length < 2) {
      return NextResponse.json({ customers: [] });
    }

    const integration = await db.integration.findFirst({
      where: { organizationId: org.id, platform: 'shopify' },
      select: SHOPIFY_ACCESS_SELECT,
    });
    const ctx = integration ? await shopifyContextFor(integration) : null;
    if (!integration || !ctx) {
      throw new NotFoundError('no_integration');
    }

    let customers: Awaited<ReturnType<typeof searchShopifyCustomerIdentities>>;
    try {
      customers = await searchShopifyCustomerIdentities(ctx, q, { first: 8, maxRetries: 0 });
    } catch (err) {
      const response = await shopifyRouteErrorResponse(err, integration, org.id);
      if (response) return response;
      throw err;
    }

    return NextResponse.json({
      customers: customers.map(({ id, first_name, last_name, email }) => ({ id, first_name, last_name, email })),
    });
  },
);

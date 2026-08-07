import { NextResponse } from 'next/server';
import { withOrgRoute } from '@/lib/api/route';
import {
  loadInboxCustomers,
  loadShopifyCustomers,
  mergeCustomerDirectory,
} from '@/lib/server/customers-directory';

export const GET = withOrgRoute(
  {
    context: 'Customers GET',
    errorMessage: 'Failed to fetch customers',
    rateLimit: { key: 'customers:get', limit: 30, windowSecs: 60 },
  },
  async ({ org, request }) => {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q')?.trim() ?? '';

    const [inboxCustomers, shopifyResult] = await Promise.all([
      loadInboxCustomers(org.id, q),
      loadShopifyCustomers(org.id, request).catch(async (err) => {
        if (err instanceof Response) throw err;
        return null;
      }),
    ]);

    if (!shopifyResult) {
      const customers = mergeCustomerDirectory(inboxCustomers, []);
      return NextResponse.json({
        customers,
        nextPageInfo: null,
        shop: null,
        hasShopify: false,
      });
    }

    const customers = mergeCustomerDirectory(inboxCustomers, shopifyResult.customers);
    return NextResponse.json({
      customers,
      nextPageInfo: shopifyResult.nextPageInfo,
      shop: shopifyResult.shop,
      hasShopify: true,
    });
  },
);

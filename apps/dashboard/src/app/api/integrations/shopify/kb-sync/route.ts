import { NextResponse } from 'next/server';
import { withOrgRoute } from '@/lib/api/route';
import { syncShopifyKnowledge } from '@/lib/server/shopify-knowledge-sync';

export const POST = withOrgRoute(
  { context: 'Shopify KB sync POST', errorMessage: 'Failed to sync Shopify KB', requireBillingWriteAllowed: true },
  async ({ org }) => NextResponse.json(await syncShopifyKnowledge(org.id)),
);

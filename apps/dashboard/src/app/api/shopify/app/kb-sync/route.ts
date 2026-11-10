import { NextResponse } from 'next/server';
import { withShopifyAppRoute } from '@/lib/shopify/app-route';
import { syncShopifyKnowledge } from '@/lib/server/shopify-knowledge-sync';

export const POST = withShopifyAppRoute(
  {
    context: 'Shopify app KB sync POST', errorMessage: 'Failed to sync Shopify KB',
    requireBillingWriteAllowed: true,
    rateLimit: { key: 'shopify:kb-sync', limit: 6, windowSecs: 60 },
  },
  async ({ org }) => NextResponse.json(await syncShopifyKnowledge(org.id)),
);

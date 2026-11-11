import { NextResponse } from 'next/server';
import { NotFoundError } from '@/lib/api/errors';
import { loadShopifyAppHomeSummary } from '@/lib/shopify/app-home';
import { withShopifyAppRoute } from '@/lib/shopify/app-route';

export const GET = withShopifyAppRoute(
  { context: 'Shopify app home GET', errorMessage: 'Failed to load Shopkeeper' },
  async ({ shop }) => {
    const summary = await loadShopifyAppHomeSummary(shop);
    if (!summary) throw new NotFoundError('Connect this store to Shopkeeper first.');
    return NextResponse.json(summary);
  },
);

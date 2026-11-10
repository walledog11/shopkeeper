import { NextResponse } from 'next/server';
import { readRequiredJsonObject } from '@/lib/api/body';
import { withShopifyAppRoute } from '@/lib/shopify/app-route';
import { loadChatConfiguration, publishChatConfiguration } from '@/lib/storefront-chat/service';

export const GET = withShopifyAppRoute(
  { context: 'Shopify app chat configuration GET', errorMessage: 'Could not load chat settings.' },
  async ({ org }) => NextResponse.json(
    await loadChatConfiguration(org.id, org.name),
    { headers: { 'Cache-Control': 'private, no-store' } },
  ),
);

export const PUT = withShopifyAppRoute(
  {
    context: 'Shopify app chat configuration PUT', errorMessage: 'Could not publish chat settings.',
    requireBillingWriteAllowed: true,
    rateLimit: { key: 'storefront-chat:publish', limit: 30, windowSecs: 60 },
  },
  async ({ org, request }) => NextResponse.json(
    await publishChatConfiguration(org.id, await readRequiredJsonObject(request)),
  ),
);

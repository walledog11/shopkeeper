import { NextResponse } from 'next/server';
import { readRequiredJsonObject } from '@/lib/api/body';
import { withShopifyAppRoute } from '@/lib/shopify/app-route';
import { getStorefrontChatReadiness } from '@/lib/storefront-chat/readiness';
import { setStorefrontChatEnabled } from '@/lib/storefront-chat/service';

export const GET = withShopifyAppRoute(
  { context: 'Shopify app storefront chat GET', errorMessage: 'Failed to check storefront chat setup' },
  async ({ org }) => NextResponse.json(await getStorefrontChatReadiness(org.id)),
);

export const PATCH = withShopifyAppRoute(
  {
    context: 'Shopify app storefront chat PATCH',
    errorMessage: 'Failed to update storefront chat',
    requireBillingWriteAllowed: true,
    rateLimit: { key: 'integrations:shopify-storefront-chat', limit: 30, windowSecs: 60 },
  },
  async ({ org, request }) => NextResponse.json(
    await setStorefrontChatEnabled(org.id, await readRequiredJsonObject(request)),
  ),
);

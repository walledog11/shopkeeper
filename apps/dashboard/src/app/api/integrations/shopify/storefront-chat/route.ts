import { NextResponse } from 'next/server';
import { withOrgRoute } from '@/lib/api/route';
import { readRequiredJsonObject } from '@/lib/api/body';
import { getStorefrontChatReadiness } from '@/lib/storefront-chat/readiness';
import { setStorefrontChatEnabled } from '@/lib/storefront-chat/service';

export const GET = withOrgRoute(
  { context: 'Shopify storefront chat GET', errorMessage: 'Failed to check storefront chat setup' },
  async ({ org }) => NextResponse.json(await getStorefrontChatReadiness(org.id)),
);

export const PATCH = withOrgRoute(
  {
    context: 'Shopify storefront chat PATCH',
    errorMessage: 'Failed to update storefront chat',
    requireAdmin: true,
    requireBillingWriteAllowed: true,
    rateLimit: { key: 'integrations:shopify-storefront-chat', limit: 30, windowSecs: 60 },
  },
  async ({ org, request }) => NextResponse.json(
    await setStorefrontChatEnabled(org.id, await readRequiredJsonObject(request)),
  ),
);

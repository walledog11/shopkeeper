import { NextResponse } from 'next/server';
import { withShopifyAppRoute } from '@/lib/shopify/app-route';
import { uploadChatPicture } from '@/lib/storefront-chat/service';

export const POST = withShopifyAppRoute(
  {
    context: 'Shopify app chat picture POST', errorMessage: 'Could not upload your picture. Please try again.',
    requireBillingWriteAllowed: true,
    rateLimit: { key: 'storefront-chat:picture', limit: 20, windowSecs: 60 },
  },
  async ({ org, request }) => NextResponse.json(await uploadChatPicture(org.id, request)),
);

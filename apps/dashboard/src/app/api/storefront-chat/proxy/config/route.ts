import { NextResponse } from 'next/server';
import { db } from '@shopkeeper/db';
import { normalizeShopifyShopDomain } from '@/lib/shopify/oauth';
import { verifyAppProxySignature, isProxyTimestampFresh } from '@/lib/shopify/app-proxy';
import { isStorefrontChatGloballyEnabled, isStorefrontChatEnabledForIntegration } from '@/lib/storefront-chat/enabled';
import { readChatConfiguration } from '@/lib/storefront-chat/configuration';
import { parseChatImageUrl } from '@/lib/storefront-chat/images';
import { getDashboardAppUrl } from '@/lib/env';

const headers = { 'Cache-Control': 'no-store' };

/** Presentation only: loading a launcher must never create a shopper session. */
export async function GET(request: Request) {
  if (!isStorefrontChatGloballyEnabled()) return NextResponse.json({ enabled: false }, { headers });
  const secret = process.env.SHOPIFY_APP_SECRET;
  const url = new URL(request.url);
  if (!secret || !verifyAppProxySignature(url, secret) || !isProxyTimestampFresh(url)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401, headers });
  }
  const shop = normalizeShopifyShopDomain(url.searchParams.get('shop') ?? '');
  if (!shop) return NextResponse.json({ error: 'missing shop' }, { status: 400, headers });
  const integration = await db.integration.findFirst({
    where: { platform: 'shopify', externalAccountId: shop, lifecycleStatus: 'active', organization: { lifecycleStatus: 'active' } },
    select: { metadata: true },
  });
  if (!integration || !isStorefrontChatEnabledForIntegration(integration.metadata)) {
    return NextResponse.json({ enabled: false }, { headers });
  }
  const configuration = readChatConfiguration(integration.metadata);
  if (configuration && parseChatImageUrl(configuration.settings.logoUrl)) {
    // The app proxy runs on the shop's origin; uploaded pictures live on ours.
    configuration.settings.logoUrl = new URL(configuration.settings.logoUrl, getDashboardAppUrl()).href;
  }
  return NextResponse.json({ enabled: true, configuration }, { headers });
}

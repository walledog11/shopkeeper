import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getShopifyOAuthCallbackConfig } from '@/lib/env';
import { normalizeShopifyShopDomain } from '@/lib/shopify/oauth';
import { verifyShopifySessionToken } from '@/lib/shopify/session-token';
import { loadShopifyAppHome } from './_lib/app-home';
import { SessionBounce } from './_components/SessionBounce';
import { SessionProblem, ShopifyAppHome } from './_components/ShopifyAppHome';

const RELOAD_PARAM = 'shopkeeper_reload';

export const metadata: Metadata = { title: 'Shopkeeper' };

/**
 * The app home: `application_url` in `shopify.app.toml`, framed by Shopify admin
 * whenever a merchant opens Shopkeeper from their Apps list. The proxy sends it
 * without Clerk, under a policy that lets only the requested shop's admin frame it.
 */
export default async function ShopifyAppHomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const param = (name: string) => typeof params[name] === 'string' ? params[name] : null;
  const config = getShopifyOAuthCallbackConfig();
  if (!config) throw new Error('Shopify is not configured');

  const shop = normalizeShopifyShopDomain(param('shop'));
  // Not a Shopify admin load: someone typed the address.
  if (!shop) redirect(`${config.appUrl}/dashboard`);

  const idToken = param('id_token');
  const session = verifyShopifySessionToken(idToken, config);
  // The framing policy names the requested shop, so only that shop's token may load its workspace.
  if (!idToken || session?.shop !== shop) {
    return param(RELOAD_PARAM) ? <SessionProblem appUrl={config.appUrl} /> : <SessionBounce reloadParam={RELOAD_PARAM} />;
  }

  return <ShopifyAppHome appUrl={config.appUrl} state={await loadShopifyAppHome(shop, idToken, config)} />;
}

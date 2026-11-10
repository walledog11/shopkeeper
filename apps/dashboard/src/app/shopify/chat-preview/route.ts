import { randomBytes } from 'node:crypto';
import { normalizeShopifyShopDomain } from '@/lib/shopify/oauth';
import { chatPreviewContentSecurityPolicy, chatPreviewDocument } from '@/lib/storefront-chat/preview-document';

// The appearance preview inside the app home. It holds no workspace data (the
// page posts the settings to it), so it needs no session, only its parents:
// the app home, and the shop's admin above it.
export async function GET(request: Request) {
  const shop = normalizeShopifyShopDomain(new URL(request.url).searchParams.get('shop'));
  const nonce = randomBytes(18).toString('base64');
  const ancestors = ["'self'", ...(shop ? [`https://${shop}`] : []), 'https://admin.shopify.com'];
  return new Response(await chatPreviewDocument(nonce), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': chatPreviewContentSecurityPolicy(nonce, ancestors),
    },
  });
}

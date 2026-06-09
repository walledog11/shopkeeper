const SHOPIFY_SHOP_DOMAIN_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

export function normalizeShopifyShopDomain(shop: string | null | undefined): string | null {
  const normalized = shop?.trim().toLowerCase();
  if (!normalized) return null;

  const shopDomain = normalized.includes('.') ? normalized : `${normalized}.myshopify.com`;
  return SHOPIFY_SHOP_DOMAIN_RE.test(shopDomain) ? shopDomain : null;
}

export interface ShopifyShopIdentity {
  id: number;
  name: string;
  myshopifyDomain: string;
}

export function parseShopifyShopIdentity(
  payload: { shop?: { id?: number | string; name?: string; myshopify_domain?: string } } | null | undefined,
  fallbackDomain: string,
): ShopifyShopIdentity | null {
  const shop = payload?.shop;
  if (shop?.id == null) return null;

  const shopId = typeof shop.id === 'string' ? Number.parseInt(shop.id, 10) : shop.id;
  if (!Number.isFinite(shopId)) return null;

  const myshopifyDomain = normalizeShopifyShopDomain(shop.myshopify_domain) ?? fallbackDomain;
  return {
    id: shopId,
    name: shop.name?.trim() || fallbackDomain,
    myshopifyDomain,
  };
}

export function isSameShopifyStore(
  authorized: ShopifyShopIdentity,
  requested: ShopifyShopIdentity,
): boolean {
  return authorized.id === requested.id;
}

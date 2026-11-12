import { shopifyGraphql, type ShopifyContext } from "./client.js";
import { isShopifySimulatorContext, SHOPIFY_SIMULATOR_DOMAIN } from "./simulator-store.js";
import { legacyIdFromGid } from "./validation.js";

/**
 * Store-level reads over the GraphQL Admin API, replacing REST `shop.json`,
 * `policies.json`, `pages.json` and the `products.json` catalog scan.
 */

export const SHOP_QUERY = `query ShopkeeperShop {
  shop {
    id
    name
    myshopifyDomain
    currencyCode
    plan { publicDisplayName partnerDevelopment }
  }
}`;

// Every published page (Shopify caps a store's pages well under this) and every
// published policy, the material the store's own knowledge base is synced from.
export const STORE_CONTENT_QUERY = `query ShopkeeperStoreContent($pages: Int!) {
  shop {
    shopPolicies { id title body }
  }
  pages(first: $pages, query: "published_status:published") {
    nodes { id title body }
  }
}`;

export interface ShopifyShopInfo {
  /** The numeric shop id, the same one Shopify's REST API used. */
  id: string;
  name: string;
  myshopifyDomain: string;
  currency: string;
  planName: string;
  /** A development store, which Shopify never bills. */
  development: boolean;
}

export async function fetchShopifyShop(
  ctx: ShopifyContext,
  options: { timeoutMs?: number; maxRetries?: number } = {},
): Promise<ShopifyShopInfo> {
  if (isShopifySimulatorContext(ctx)) {
    return {
      id: "1",
      name: "Linen & Loom",
      myshopifyDomain: SHOPIFY_SIMULATOR_DOMAIN,
      currency: "USD",
      planName: "Development",
      development: true,
    };
  }
  const data = await shopifyGraphql<{
    shop: {
      id: string;
      name: string;
      myshopifyDomain: string;
      currencyCode: string;
      plan: { publicDisplayName: string; partnerDevelopment: boolean };
    };
  }>(ctx, SHOP_QUERY, {}, options);
  return {
    id: legacyIdFromGid(data.shop.id),
    name: data.shop.name,
    myshopifyDomain: data.shop.myshopifyDomain,
    currency: data.shop.currencyCode,
    planName: data.shop.plan.publicDisplayName,
    development: data.shop.plan.partnerDevelopment,
  };
}

export interface ShopifyContentItem {
  /** The numeric id, the same one Shopify's REST API used for pages. */
  id: string;
  title: string;
  /** HTML. */
  body: string;
}

export async function fetchShopifyStoreContent(
  ctx: ShopifyContext,
): Promise<{ policies: ShopifyContentItem[]; pages: ShopifyContentItem[] }> {
  const data = await shopifyGraphql<{
    shop: { shopPolicies: { id: string; title: string; body: string }[] };
    pages: { nodes: { id: string; title: string; body: string }[] };
  }>(ctx, STORE_CONTENT_QUERY, { pages: 250 }, { maxRetries: 0 });
  const item = (node: { id: string; title: string; body: string }) => ({
    id: legacyIdFromGid(node.id),
    title: node.title,
    body: node.body,
  });
  return { policies: data.shop.shopPolicies.map(item), pages: data.pages.nodes.map(item) };
}

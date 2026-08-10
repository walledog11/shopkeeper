// Deep link into the theme editor with the Shopkeeper Chat app embed selected.
// Block handle matches extensions/shopkeeper-chat/blocks/chat.liquid.
export const SHOPIFY_STOREFRONT_CHAT_EMBED_BLOCK_HANDLE = "chat";

export function buildShopifyThemeEditorAppEmbedUrl(
  shopDomain: string,
  clientId: string,
): string {
  const shop = shopDomain.trim().toLowerCase();
  const appId = clientId.trim();
  if (!shop || !appId) {
    throw new Error("Shop domain and Shopify client id are required");
  }

  const url = new URL(`https://${shop}/admin/themes/current/editor`);
  url.searchParams.set("context", "apps");
  url.searchParams.set("template", "index");
  url.searchParams.set(
    "activateAppId",
    `${appId}/${SHOPIFY_STOREFRONT_CHAT_EMBED_BLOCK_HANDLE}`,
  );
  return url.toString();
}

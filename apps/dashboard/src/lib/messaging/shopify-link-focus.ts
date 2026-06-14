export const SHOPIFY_LINK_FOCUS_EVENT = "shopkeeper:focus-shopify-link"

export function requestShopifyLinkFocus() {
  window.dispatchEvent(new CustomEvent(SHOPIFY_LINK_FOCUS_EVENT))
}

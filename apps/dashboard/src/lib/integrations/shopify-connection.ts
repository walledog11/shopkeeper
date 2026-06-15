import type { Integration } from "@/types"
import { isApiRequestError } from "@/lib/api/fetcher"

export type ShopifyConnectionState = NonNullable<Integration["connectionState"]> | "missing"

const SHOPIFY_DISCONNECTED_MESSAGE = "Shopify was disconnected."
const SHOPIFY_EXPIRED_MESSAGE =
  "Shopify connection expired — reconnect to restore order lookups."

export function resolveShopifyConnectionState(
  integration: Integration | undefined,
): ShopifyConnectionState {
  if (!integration) return "missing"
  return integration.connectionState ?? "active"
}

export function isShopifyIntegrationActive(integration: Integration | undefined): boolean {
  return resolveShopifyConnectionState(integration) === "active"
}

export function isShopifyIntegrationLinked(integration: Integration | undefined): boolean {
  const state = resolveShopifyConnectionState(integration)
  return state === "active" || state === "invalid"
}

export function getShopifyDisconnectMessage(state: ShopifyConnectionState): string | null {
  if (state === "missing" || state === "incomplete") return SHOPIFY_DISCONNECTED_MESSAGE
  if (state === "invalid") return SHOPIFY_EXPIRED_MESSAGE
  return null
}

export function isShopifyOrdersUnavailable(error: unknown): boolean {
  return (
    isApiRequestError(error, 404) ||
    isApiRequestError(error, 401) ||
    isApiRequestError(error, 403)
  )
}

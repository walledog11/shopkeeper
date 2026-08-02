export type ShopifyConnectionState = "active" | "invalid" | "incomplete";

export interface ShopifyIntegrationHealthInput {
  accessToken: string | null;
  tokenExpiresAt: Date | null;
  metadata?: unknown;
}

export function isSimulatedShopifyIntegration(metadata: unknown): boolean {
  return (
    typeof metadata === "object"
    && metadata !== null
    && "simulated" in metadata
    && metadata.simulated === true
  );
}

export function getShopifyConnectionState(
  integration: Pick<ShopifyIntegrationHealthInput, "accessToken" | "tokenExpiresAt">,
): ShopifyConnectionState {
  if (!integration.accessToken) return "incomplete";
  if (integration.tokenExpiresAt && integration.tokenExpiresAt.getTime() <= Date.now()) {
    return "invalid";
  }
  return "active";
}

export function isShopifyIntegrationOperational(
  integration: Pick<ShopifyIntegrationHealthInput, "accessToken" | "tokenExpiresAt">,
): boolean {
  return getShopifyConnectionState(integration) === "active";
}

// Cross-org monitor sweeps select every tokened Shopify integration, so they
// need the simulated check as well: simulator rows carry a live-looking token
// and no expiry, which reads as `active`.
export function isShopifyIntegrationSweepable(
  integration: ShopifyIntegrationHealthInput,
): boolean {
  if (isSimulatedShopifyIntegration(integration.metadata)) return false;
  return isShopifyIntegrationOperational(integration);
}

// The scopes the tools need. Under Shopify managed installation this list does
// not decide what a merchant grants — the Partner Dashboard app configuration
// does — so read it as the expectation a real grant is checked against, not as
// the request. A token keeps whatever grant it was issued with, so an install
// that predates a capability expansion stays short of this list until the
// merchant re-authorizes.
export const SHOPIFY_OAUTH_SCOPES = [
  "read_customers",
  "write_customers",
  "read_orders",
  "write_orders",
  "write_order_edits",
  "read_merchant_managed_fulfillment_orders",
  "write_merchant_managed_fulfillment_orders",
  "read_returns",
  "write_returns",
  "read_products",
  "read_content",
  "write_gift_cards",
  "write_discounts",
  "read_store_credit_accounts",
  "write_store_credit_account_transactions",
] as const;

// Shopify's `write_x` grant includes `read_x`, and the granted list does not
// always spell the implied read out, so satisfy a requested read either way.
export function missingShopifyScopes(granted: readonly string[]): string[] {
  const held = new Set(granted.map((scope) => scope.trim().toLowerCase()).filter(Boolean));
  return SHOPIFY_OAUTH_SCOPES.filter((scope) => {
    if (held.has(scope)) return false;
    const readMatch = scope.match(/^read_(.+)$/);
    return !(readMatch && held.has(`write_${readMatch[1]}`));
  });
}

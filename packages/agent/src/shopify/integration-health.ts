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
  "write_products",
  "read_content",
  "write_gift_cards",
  "write_discounts",
  "read_store_credit_accounts",
  "write_store_credit_account_transactions",
] as const;

export type ShopifyOAuthScope = (typeof SHOPIFY_OAUTH_SCOPES)[number];

// Shopify's `write_x` grant includes `read_x`, and the granted list does not
// always spell the implied read out, so satisfy a requested read either way.
// One owner for that rule: `missingShopifyScopes` and the per-tool gate below
// both go through `holdsShopifyScope` rather than each re-deriving the
// implication.
function normalizeGrantedScopes(granted: readonly string[]): ReadonlySet<string> {
  return new Set(granted.map((scope) => scope.trim().toLowerCase()).filter(Boolean));
}

function holdsScope(held: ReadonlySet<string>, scope: string): boolean {
  if (held.has(scope)) return true;
  const readMatch = scope.match(/^read_(.+)$/);
  return Boolean(readMatch && held.has(`write_${readMatch[1]}`));
}

export function missingShopifyScopes(granted: readonly string[]): string[] {
  const held = normalizeGrantedScopes(granted);
  return SHOPIFY_OAUTH_SCOPES.filter((scope) => !holdsScope(held, scope));
}

/**
 * Whether a grant covers every scope a capability needs.
 *
 * A token keeps the grant it was issued with, so an install that predates a
 * capability expansion is short of the scopes that expansion added. That is the
 * normal state for an existing merchant, not a fault: the capability is withheld
 * and everything else keeps working.
 *
 * An empty `granted` means we have no record of the grant rather than a record
 * of an empty one — pre-`oauthScopes` installs have no metadata to read. Those
 * are treated as holding nothing new, which withholds the new capability and
 * leaves every previously working tool untouched, because no tool that shipped
 * before this gate declares a required scope.
 */
export function grantCoversScopes(
  granted: readonly string[],
  required: readonly string[],
): boolean {
  if (required.length === 0) return true;
  const held = normalizeGrantedScopes(granted);
  return required.every((scope) => holdsScope(held, scope));
}

/**
 * The grant recorded on an integration, or null when none was ever recorded.
 *
 * Null and `[]` are different: null is an install that predates scope recording,
 * `[]` is a recorded grant of nothing. Callers that must not punish the former
 * check for null first.
 */
export function recordedShopifyScopes(metadata: unknown): string[] | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const scopes = (metadata as Record<string, unknown>).oauthScopes;
  if (!Array.isArray(scopes)) return null;
  return scopes.filter((scope): scope is string => typeof scope === "string");
}

/** The scopes a capability needs that this grant does not cover. */
export function unmetScopes(
  granted: readonly string[],
  required: readonly string[],
): string[] {
  const held = normalizeGrantedScopes(granted);
  return required.filter((scope) => !holdsScope(held, scope));
}

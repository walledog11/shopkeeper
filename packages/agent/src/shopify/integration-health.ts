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

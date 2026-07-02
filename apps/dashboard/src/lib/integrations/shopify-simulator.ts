export const SHOPIFY_SIMULATOR_DOMAIN = "demo-store.shopkeeper.test";
export const SHOPIFY_SIMULATOR_TOKEN = "shopkeeper-development-simulator";

export function isShopifySimulatorEnabled(
  env: {
    NODE_ENV?: string;
    SHOPIFY_ONBOARDING_SIMULATOR_ENABLED?: string;
  } = process.env,
): boolean {
  if (env.NODE_ENV === "production") return false;
  return env.NODE_ENV === "development" || env.SHOPIFY_ONBOARDING_SIMULATOR_ENABLED === "true";
}

export function isSimulatedShopifyIntegration(metadata: unknown): boolean {
  return (
    typeof metadata === "object"
    && metadata !== null
    && "simulated" in metadata
    && metadata.simulated === true
  );
}

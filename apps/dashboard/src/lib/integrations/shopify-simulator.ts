export { isSimulatedShopifyIntegration } from "@shopkeeper/agent/shopify/integration-health";
export {
  SHOPIFY_SIMULATOR_DOMAIN,
  SHOPIFY_SIMULATOR_TOKEN,
} from "@shopkeeper/agent/shopify";

export function isShopifySimulatorEnabled(
  env: {
    NODE_ENV?: string;
    SHOPIFY_ONBOARDING_SIMULATOR_ENABLED?: string;
  } = process.env,
): boolean {
  if (env.NODE_ENV === "production") return false;
  return env.NODE_ENV === "development" || env.SHOPIFY_ONBOARDING_SIMULATOR_ENABLED === "true";
}

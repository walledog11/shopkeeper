import { requestJson, requestOk } from "@/lib/api/fetcher";

export interface OnboardingSettingsRequest {
  name?: string;
  settings: {
    autonomyTier: "guarded";
    autoExecuteMode: "off";
    digestTimezone?: string;
    onboardingCompletedAt?: string;
  };
}

export function persistOnboardingSettings(body: OnboardingSettingsRequest): Promise<void> {
  return requestOk("/api/org", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, "Couldn't save your onboarding settings. Try again.");
}

export function createForwardingEmail(email: string): Promise<void> {
  return requestOk("/api/integrations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ platform: "email", externalAccountId: email }),
  }, "Couldn't save that support address. Try again.");
}

export function updateGmailSupportAddress(integrationId: string, email: string): Promise<void> {
  return requestOk(`/api/integrations/${integrationId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fromEmail: email }),
  }, "Couldn't save that support address. Try again.");
}

export function simulateShopifyIntegration(): Promise<void> {
  return requestOk("/api/integrations/shopify/simulate", { method: "POST" },
    "Couldn't connect the demo store. Try again.");
}

export interface ShopifyKnowledgeSyncResult {
  syncedPages: number;
  syncedPolicies: number;
}

export async function synchronizeShopifyKnowledge(): Promise<ShopifyKnowledgeSyncResult> {
  const result = await requestJson<{
    syncedPages?: number;
    syncedPolicies?: number;
  }>("/api/integrations/shopify/kb-sync", { method: "POST" },
  "Couldn't read your Shopify store. Try again.");
  return {
    syncedPages: result.syncedPages ?? 0,
    syncedPolicies: result.syncedPolicies ?? 0,
  };
}

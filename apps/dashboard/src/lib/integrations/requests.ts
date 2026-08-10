import { requestJson, requestOk } from "@/lib/api/fetcher"

function jsonRequest(method: "PATCH" | "POST", body?: unknown): RequestInit {
  return {
    method,
    ...(body === undefined ? {} : {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  }
}

export function connectForwardingEmail(platform: "email", externalAccountId: string): Promise<void> {
  return requestOk(
    "/api/integrations",
    jsonRequest("POST", { platform, externalAccountId }),
    "Failed to connect. Please try again.",
  )
}

export function disconnectIntegration(integrationId: string): Promise<void> {
  return requestOk(
    `/api/integrations/${integrationId}`,
    { method: "DELETE" },
    "Failed to disconnect. Please try again.",
  )
}

export function updateIntegrationEmail(integrationId: string, fromEmail: string): Promise<void> {
  return requestOk(
    `/api/integrations/${integrationId}`,
    jsonRequest("PATCH", { fromEmail }),
    "Enter a valid support email address and try again.",
  )
}

export function setDefaultEmailIntegration(integrationId: string): Promise<void> {
  return requestOk(
    "/api/integrations/email/default",
    jsonRequest("PATCH", { integrationId }),
    "Failed to update the default email integration.",
  )
}

export function syncShopifyKnowledgeBase(): Promise<{ syncedPolicies: number; syncedPages: number }> {
  return requestJson(
    "/api/integrations/shopify/kb-sync",
    jsonRequest("POST"),
    "Sync failed, please try again.",
  )
}

export function updateShopifyStorefrontChat(enabled: boolean): Promise<{ enabled: boolean }> {
  return requestJson(
    "/api/integrations/shopify/storefront-chat",
    jsonRequest("PATCH", { enabled }),
    "Failed to update storefront chat. Please try again.",
  )
}

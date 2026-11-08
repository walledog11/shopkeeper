import type { MerchantPreferenceCategory, MerchantPreferenceRecord } from "@shopkeeper/db/merchant-preferences"
import { requestJson } from "@/lib/api/fetcher"

export function createPreference(category: MerchantPreferenceCategory, guidance: string) {
  return requestJson<{ preference: MerchantPreferenceRecord }>(
    "/api/agent/preferences",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, guidance }),
    },
    "Failed to save preference.",
  )
}

export function updatePreference(id: string, action: "confirm" | "reject" | "archive") {
  return requestJson<{ preference: MerchantPreferenceRecord }>(
    `/api/agent/preferences/${id}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    },
    "Failed to update preference.",
  )
}

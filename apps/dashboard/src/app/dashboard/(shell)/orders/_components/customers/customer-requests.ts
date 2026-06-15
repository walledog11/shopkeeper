import { requestJson } from "@/lib/api/fetcher"
import type { CustomersResponse } from "./customers-page-utils"

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string"
}

export async function fetchCustomersPage(pageInfo: string): Promise<CustomersResponse> {
  const fallback = "Unable to load more customers."
  const payload = await requestJson<Partial<CustomersResponse>>(
    `/api/shopify/customers?page_info=${encodeURIComponent(pageInfo)}`,
    {},
    fallback,
  )
  if (!Array.isArray(payload.customers) || !isNullableString(payload.nextPageInfo)) {
    throw new Error(fallback)
  }
  return {
    customers: payload.customers,
    nextPageInfo: payload.nextPageInfo,
    shop: typeof payload.shop === "string" ? payload.shop : "",
  }
}

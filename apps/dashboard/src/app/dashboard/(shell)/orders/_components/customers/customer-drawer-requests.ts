import {
  errorMessageFromPayload,
  readJsonResponse,
} from "@/lib/api/fetcher"
import { fullName, type CustomerRow, type EditState } from "./customers-page-utils"

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export function makeCustomerEditDraft(customer: CustomerRow): EditState {
  const addr = customer.default_address
  return {
    first_name: customer.first_name ?? "",
    last_name: customer.last_name ?? "",
    email: customer.email ?? "",
    phone: customer.phone ?? "",
    address1: addr?.address1 ?? "",
    city: addr?.city ?? "",
    province: addr?.province ?? "",
    zip: addr?.zip ?? "",
    country: addr?.country_name ?? "",
  }
}

export function buildCustomerUpdatePayload(customerId: CustomerRow["id"], draft: EditState) {
  return {
    customerId,
    updates: {
      first_name: draft.first_name,
      last_name: draft.last_name,
      email: draft.email,
      phone: draft.phone || null,
      address: {
        address1: draft.address1 || null,
        city: draft.city || null,
        province: draft.province || null,
        zip: draft.zip || null,
        country: draft.country || null,
      },
    },
  }
}

export async function saveCustomerUpdates(
  customerId: CustomerRow["id"],
  draft: EditState,
  fetchImpl: FetchLike = fetch,
) {
  const res = await fetchImpl("/api/shopify/customer", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildCustomerUpdatePayload(customerId, draft)),
  })
  const json = await readJsonResponse<{ customer?: Partial<CustomerRow>; error?: unknown }>(res)

  if (!res.ok) {
    throw new Error(errorMessageFromPayload(json, "Failed to save customer."))
  }
  if (!json?.customer) {
    throw new Error("Failed to save customer.")
  }

  return json.customer
}

export async function startCustomerSupportThread(customer: CustomerRow, fetchImpl: FetchLike = fetch) {
  const res = await fetchImpl("/api/threads/shopify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      shopifyCustomerId: String(customer.id),
      customerEmail: customer.email,
      customerName: fullName(customer),
    }),
  })
  const json = await readJsonResponse<{ threadId?: string; error?: unknown }>(res)

  if (!res.ok) {
    throw new Error(errorMessageFromPayload(json, "Failed to start support thread."))
  }
  if (!json?.threadId) {
    throw new Error("Failed to start support thread.")
  }

  return json.threadId
}

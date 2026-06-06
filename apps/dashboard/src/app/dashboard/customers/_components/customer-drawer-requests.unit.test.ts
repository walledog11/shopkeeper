import { describe, expect, it, vi } from "vitest"
import {
  buildCustomerUpdatePayload,
  makeCustomerEditDraft,
  saveCustomerUpdates,
  startCustomerSupportThread,
} from "./customer-drawer-requests"
import type { CustomerRow, EditState } from "./customers-page-utils"

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), init)
}

const customer: CustomerRow = {
  id: 123,
  first_name: "Maya",
  last_name: "Stone",
  email: "maya@example.com",
  phone: null,
  orders_count: 2,
  total_spent: "42.00",
  created_at: "2026-06-05T12:00:00.000Z",
  default_address: {
    address1: "1 Main",
    city: "Oakland",
    province: "CA",
    country_name: "United States",
    zip: "94607",
  },
}

const draft: EditState = {
  first_name: "Maya",
  last_name: "Stone",
  email: "maya@example.com",
  phone: "",
  address1: "",
  city: "Oakland",
  province: "",
  zip: "",
  country: "United States",
}

describe("customer edit payloads", () => {
  it("creates a draft from customer details", () => {
    expect(makeCustomerEditDraft(customer)).toMatchObject({
      first_name: "Maya",
      address1: "1 Main",
      country: "United States",
    })
  })

  it("normalizes empty optional fields to null for Shopify updates", () => {
    expect(buildCustomerUpdatePayload(123, draft)).toEqual({
      customerId: 123,
      updates: {
        first_name: "Maya",
        last_name: "Stone",
        email: "maya@example.com",
        phone: null,
        address: {
          address1: null,
          city: "Oakland",
          province: null,
          zip: null,
          country: "United States",
        },
      },
    })
  })
})

describe("customer mutation requests", () => {
  it("surfaces failed customer saves", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: "Email is invalid" }, { status: 400 }))

    await expect(saveCustomerUpdates(123, draft, fetchImpl)).rejects.toThrow("Email is invalid")
  })

  it("creates support threads with Shopify customer identity", async () => {
    const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = []
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push([input, init])
      return jsonResponse({ threadId: "thread-1" }, { status: 200 })
    })

    await expect(startCustomerSupportThread(customer, fetchImpl)).resolves.toBe("thread-1")
    expect(JSON.parse(calls[0][1]?.body as string)).toEqual({
      shopifyCustomerId: "123",
      customerEmail: "maya@example.com",
      customerName: "Maya Stone",
    })
  })

  it("surfaces failed support thread starts", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: "Missing integration" }, { status: 400 }))

    await expect(startCustomerSupportThread(customer, fetchImpl)).rejects.toThrow("Missing integration")
  })
})

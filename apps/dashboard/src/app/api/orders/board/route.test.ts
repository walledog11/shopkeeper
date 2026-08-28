import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { jsonResponse } from "@shopkeeper/agent/testing";
import { ChannelType } from "@shopkeeper/db"
import { cleanupTestData, createTestIntegration, createTestOrg } from "@shopkeeper/db/test-helpers"

const { mockFetch } = vi.hoisted(() => ({
  mockFetch: vi.fn(),
}))

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
}))

import { auth } from "@clerk/nextjs/server"
import { GET } from "./route"

let org: Awaited<ReturnType<typeof createTestOrg>>

beforeEach(async () => {
  org = await createTestOrg()
  vi.mocked(auth).mockResolvedValue({
    userId: "usr_orders_board",
    orgId: org.clerkOrgId,
  } as ReturnType<typeof auth> extends Promise<infer T> ? T : never)
  vi.stubGlobal("fetch", mockFetch)
})

afterEach(async () => {
  await cleanupTestData(org?.id)
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

function sampleOrder(id: number, name: string) {
  return {
    id,
    name,
    created_at: "2026-01-01T00:00:00Z",
    financial_status: "paid",
    fulfillment_status: null,
    total_price: "10.00",
    current_total_price: "10.00",
    currency: "CAD",
    customer: null,
    line_items: [],
  }
}

describe("GET /api/orders/board", () => {
  it("fetches all board columns in one response", async () => {
    await createTestIntegration(org.id, {
      platform: ChannelType.shopify,
      externalAccountId: "board-orders.myshopify.com",
      accessToken: "board-orders-token",
    })

    mockFetch
      .mockResolvedValueOnce(jsonResponse({ orders: [sampleOrder(1, "#1001")] }, {
        headers: { Link: "<https://example.com?page_info=unfulfilled>; rel=\"next\"" },
      }))
      .mockResolvedValueOnce(jsonResponse({ orders: [{
        ...sampleOrder(2, "#1002"),
        financial_status: "authorized",
      }] }))
      .mockResolvedValueOnce(jsonResponse({ orders: [{
        ...sampleOrder(3, "#1003"),
        fulfillment_status: "fulfilled",
      }] }))

    const res = await GET()
    const body = await res.json() as {
      shop: string
      columns: Record<string, { orders: Array<{ id: number; currency: string }>; nextPageInfo: string | null }>
    }

    expect(res.status).toBe(200)
    expect(body.shop).toBe("board-orders.myshopify.com")
    expect(body.columns.needs_fulfillment.orders).toHaveLength(1)
    expect(body.columns.unpaid.orders).toHaveLength(1)
    expect(body.columns.fulfilled.orders).toHaveLength(1)
    expect(body.columns.needs_fulfillment.orders[0].currency).toBe("CAD")
    expect(mockFetch).toHaveBeenCalledTimes(3)
    expect(String(mockFetch.mock.calls[0][0])).toContain("currency")
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ChannelType } from "@shopkeeper/db"
import { cleanupTestData, createTestIntegration, createTestOrg } from "@shopkeeper/db/test-helpers"

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }))

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn(), clerkClient: vi.fn() }))

import { auth } from "@clerk/nextjs/server"
import { GET } from "./route"

let org: Awaited<ReturnType<typeof createTestOrg>>

beforeEach(async () => {
  org = await createTestOrg()
  vi.mocked(auth).mockResolvedValue({ userId: "usr_order_column", orgId: org.clerkOrgId } as never)
  vi.stubGlobal("fetch", mockFetch)
})

afterEach(async () => {
  await cleanupTestData(org?.id)
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

function jsonResponse(body: unknown, cursor?: string): Response {
  return Response.json(body, cursor ? {
    headers: { Link: `<https://example.com?page_info=${cursor}>; rel="next"` },
  } : undefined)
}

function order(id: number, financial_status: string, fulfillment_status: string | null = null) {
  return {
    id,
    name: `#${id}`,
    created_at: "2026-08-01T00:00:00Z",
    financial_status,
    fulfillment_status,
    total_price: "10.00",
    current_total_price: "10.00",
    currency: "USD",
    customer: null,
    line_items: [],
  }
}

async function connect() {
  await createTestIntegration(org.id, {
    platform: ChannelType.shopify,
    externalAccountId: "column-orders.myshopify.com",
    accessToken: "column-token",
  })
}

function call(columnId: string, query = "") {
  return GET(
    new Request(`http://localhost/api/orders/board/${columnId}${query}`),
    { params: Promise.resolve({ columnId }) },
  )
}

describe("GET /api/orders/board/[columnId]", () => {
  it("scans overlapping and excluded pages for canonical rows", async () => {
    await connect()
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ orders: [order(1, "authorized")] }, "second"))
      .mockResolvedValueOnce(jsonResponse({ orders: [order(2, "refunded")] }, "third"))
      .mockResolvedValueOnce(jsonResponse({ orders: [order(3, "paid")] }, "fourth"))

    const res = await call("needs_fulfillment", "?page_info=first&limit=10")
    const body = await res.json() as { orders: Array<{ id: number }>; nextPageInfo: string | null }

    expect(res.status).toBe(200)
    expect(body.orders.map(item => item.id)).toEqual([3])
    expect(body.nextPageInfo).toBe("fourth")
    expect(mockFetch).toHaveBeenCalledTimes(3)
    expect(String(mockFetch.mock.calls[0][0])).toContain("page_info=first")
    expect(String(mockFetch.mock.calls[0][0])).toContain("limit=10")
  })

  it("returns a cursor after the five-page scan limit even when no rows qualify", async () => {
    await connect()
    for (let page = 1; page <= 5; page += 1) {
      mockFetch.mockResolvedValueOnce(jsonResponse({ orders: [order(page, page % 2 ? "authorized" : "voided")] }, `cursor-${page}`))
    }

    const res = await call("needs_fulfillment", "?page_info=start")
    const body = await res.json() as { orders: unknown[]; nextPageInfo: string | null }
    expect(body.orders).toEqual([])
    expect(body.nextPageInfo).toBe("cursor-5")
    expect(mockFetch).toHaveBeenCalledTimes(5)
  })

  it.each([
    ["unknown", ""],
    ["unpaid", "?page_info="],
    ["unpaid", "?limit=0"],
    ["unpaid", "?limit=51"],
    ["unpaid", "?limit=1.5"],
    ["unpaid", "?q=1001"],
  ])("rejects invalid column requests", async (columnId, query) => {
    const res = await call(columnId, query)
    expect(res.status).toBe(400)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("surfaces provider failures", async () => {
    await connect()
    mockFetch.mockResolvedValueOnce(Response.json({ errors: "unavailable" }, { status: 503 }))
    const res = await call("fulfilled", "?page_info=next")
    expect(res.status).toBe(503)
    await expect(res.json()).resolves.toEqual({ error: "shopify_error", details: { errors: "unavailable" } })
  })
})

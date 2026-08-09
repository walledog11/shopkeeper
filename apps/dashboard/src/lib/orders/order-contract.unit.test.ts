import { describe, expect, it } from "vitest"
import {
  classifyOrder,
  isOrdersBoardResponse,
  isOrdersPageResponse,
  parseOrderBoardRequestParams,
  parseOrdersRequestParams,
  type OrderRow,
} from "./order-contract"

function order(overrides: Partial<OrderRow> = {}): OrderRow {
  return {
    id: 1,
    name: "#1001",
    created_at: "2026-08-01T00:00:00Z",
    financial_status: "paid",
    fulfillment_status: null,
    total_price: "25.00",
    currency: "CAD",
    customer: { id: 2, name: null, email: null },
    line_items: [],
    ...overrides,
  }
}

describe("order contract", () => {
  it("classifies overlapping states canonically and excludes closed orders", () => {
    expect(classifyOrder(order({ financial_status: "authorized" }))).toBe("unpaid")
    expect(classifyOrder(order({ financial_status: "paid", fulfillment_status: null }))).toBe("needs_fulfillment")
    expect(classifyOrder(order({ fulfillment_status: "fulfilled" }))).toBe("fulfilled")
    expect(classifyOrder(order({ financial_status: "refunded" }))).toBe("excluded")
    expect(classifyOrder(order({ financial_status: "voided" }))).toBe("excluded")
  })

  it("accepts realistic nullable customer fields in API responses", () => {
    expect(isOrdersPageResponse({ orders: [order()], nextPageInfo: null, shop: "store.myshopify.com" })).toBe(true)
    expect(isOrdersPageResponse({
      orders: [order({ customer: { id: 2, name: null, email: "customer@example.com" } })],
      nextPageInfo: "cursor",
      shop: "store.myshopify.com",
    })).toBe(true)
  })

  it("rejects malformed page and board responses", () => {
    expect(isOrdersPageResponse({ orders: [{ ...order(), currency: undefined }], nextPageInfo: null, shop: "shop" })).toBe(false)
    expect(isOrdersBoardResponse({ shop: "shop", columns: {} })).toBe(false)
    expect(isOrdersBoardResponse({
      shop: "shop",
      columns: {
        needs_fulfillment: { orders: [order()], nextPageInfo: null },
        unpaid: { orders: [], nextPageInfo: null },
        fulfilled: { orders: [], nextPageInfo: null },
      },
    })).toBe(true)
  })

  it.each(["1001", "#1001", "customer@example.com"])("accepts supported search query %s", query => {
    expect(parseOrdersRequestParams(new URLSearchParams({ q: query }))).toMatchObject({ query, limit: 25 })
  })

  it.each(["customer name", "not-an-email", "#12x"])("rejects unsupported search query %s", query => {
    expect(() => parseOrdersRequestParams(new URLSearchParams({ q: query }))).toThrow(/order number or customer email/)
  })

  it("validates column ids, cursors, and strict integer limits", () => {
    expect(parseOrderBoardRequestParams("unpaid", new URLSearchParams({ page_info: "next", limit: "50" }))).toEqual({
      columnId: "unpaid",
      pageInfo: "next",
      limit: 50,
    })
    expect(() => parseOrderBoardRequestParams("refunds", new URLSearchParams())).toThrow(/Unknown/)
    expect(() => parseOrderBoardRequestParams("unpaid", new URLSearchParams("page_info="))).toThrow(/page_info/)
    for (const limit of ["0", "51", "2.5", "abc", " 2"]) {
      expect(() => parseOrdersRequestParams(new URLSearchParams({ limit }))).toThrow(/limit/)
    }
  })
})

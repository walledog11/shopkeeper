import { describe, expect, it } from "vitest"
import type { OrderRow } from "@/lib/orders/order-contract"
import {
  customerLabel,
  matchOrderFromSearch,
  orderStatusMeta,
  shopifyAdminOrderHref,
} from "./shop-page-utils"

function order(overrides: Partial<OrderRow> = {}): OrderRow {
  return {
    id: 1042,
    name: "#1042",
    created_at: "2026-08-23T12:00:00.000Z",
    financial_status: "paid",
    fulfillment_status: null,
    total_price: "248.00",
    currency: "USD",
    customer: { id: 1, name: "Devon Park", email: "devon@example.com" },
    line_items: [{ title: "Flax Duvet Set", quantity: 1, variant_title: null }],
    ...overrides,
  }
}

describe("shop page utils", () => {
  it("builds a Shopify admin href only when shop and order id are present", () => {
    expect(shopifyAdminOrderHref("linen.myshopify.com", 1042))
      .toBe("https://linen.myshopify.com/admin/orders/1042")
    expect(shopifyAdminOrderHref(null, 1042)).toBeNull()
    expect(shopifyAdminOrderHref("linen.myshopify.com", null)).toBeNull()
  })

  it("prefers the customer name and falls back to email or guest", () => {
    expect(customerLabel(order())).toBe("Devon Park")
    expect(customerLabel(order({ customer: { id: 2, name: null, email: "guest@example.com" } })))
      .toBe("guest@example.com")
    expect(customerLabel(order({ customer: null }))).toBe("Guest checkout")
  })

  it("surfaces payment trouble before fulfillment state", () => {
    expect(orderStatusMeta(order({ financial_status: "pending" }))).toEqual({
      label: "Payment pending",
      tone: "caution",
    })
    expect(orderStatusMeta(order({ fulfillment_status: "fulfilled" }))).toEqual({
      label: "Fulfilled",
      tone: "neutral",
    })
    expect(orderStatusMeta(order())).toEqual({
      label: "Unfulfilled",
      tone: "caution",
    })
  })

  it("matches a searched order by id and falls back to the first result", () => {
    const first = order({ id: 1, name: "#1" })
    const second = order({ id: 2, name: "#2" })
    expect(matchOrderFromSearch([first, second], "2")).toEqual(second)
    expect(matchOrderFromSearch([first, second], "9")).toEqual(first)
    expect(matchOrderFromSearch([], "2")).toBeNull()
  })
})

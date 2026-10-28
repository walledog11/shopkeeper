import { describe, expect, it } from "vitest"
import { normalizeOrder, type ShopifyOrderRaw } from "./orders-service"

describe("normalizeOrder", () => {
  it("normalizes currency, nullable customer fields, and current quantities", () => {
    const raw: ShopifyOrderRaw = {
      id: 1001,
      name: "#1001",
      created_at: "2026-08-01T00:00:00Z",
      financial_status: "paid",
      fulfillment_status: null,
      total_price: "30.00",
      current_total_price: "20.00",
      currency: "cad",
      customer: { id: 2, first_name: null, last_name: null, email: null },
      line_items: [
        { title: "Hat", quantity: 2, current_quantity: 1, variant_title: null },
        { title: "Returned shirt", quantity: 1, current_quantity: 0, variant_title: "Blue" },
      ],
    }

    expect(normalizeOrder(raw)).toEqual({
      id: 1001,
      name: "#1001",
      created_at: "2026-08-01T00:00:00Z",
      financial_status: "paid",
      fulfillment_status: null,
      total_price: "20.00",
      currency: "CAD",
      customer: { id: 2, name: null, email: null },
      line_items: [{ title: "Hat", quantity: 1, variant_title: null }],
    })
  })
})

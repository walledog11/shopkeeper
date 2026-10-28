import { describe, expect, it } from "vitest"
import { parseFlagOrderRow } from "./route"

// Mirrors the strings emitted by @shopkeeper/agent/order-ops run.ts:
//   instruction = `order-risk-review:${order.id}`
//   summary     = `Flagged order ${order.name} for review: ${reason}`
//   input       = { reason }
const at = new Date("2026-06-21T12:00:00.000Z")

describe("parseFlagOrderRow", () => {
  it("recovers order id, name, and reason from a well-formed finding", () => {
    const result = parseFlagOrderRow({
      id: "row-1",
      input: { reason: "Shipping address mismatch, high-value first order" },
      instruction: "order-risk-review:5012345678",
      summary: "Flagged order #1043 for review: Shipping address mismatch, high-value first order",
      executedAt: at,
    })
    expect(result).toEqual({
      id: "row-1",
      orderId: "5012345678",
      orderName: "#1043",
      reason: "Shipping address mismatch, high-value first order",
      at: "2026-06-21T12:00:00.000Z",
    })
  })

  it("prefers the tool input reason over the summary tail", () => {
    const result = parseFlagOrderRow({
      id: "row-2",
      input: { reason: "Structured reason" },
      instruction: "order-risk-review:99",
      summary: "Flagged order #2 for review: summary tail reason",
      executedAt: at,
    })
    expect(result.reason).toBe("Structured reason")
  })

  it("falls back to the summary tail when input has no reason", () => {
    const result = parseFlagOrderRow({
      id: "row-3",
      input: {},
      instruction: "order-risk-review:99",
      summary: "Flagged order #2 for review: summary tail reason",
      executedAt: at,
    })
    expect(result.reason).toBe("summary tail reason")
  })

  it("derives a name from the order id when the summary is unparseable", () => {
    const result = parseFlagOrderRow({
      id: "row-4",
      input: { reason: "risk" },
      instruction: "order-risk-review:777",
      summary: null,
      executedAt: at,
    })
    expect(result.orderId).toBe("777")
    expect(result.orderName).toBe("Order 777")
  })

  it("degrades safely when neither instruction nor summary is present", () => {
    const result = parseFlagOrderRow({
      id: "row-5",
      input: null,
      instruction: null,
      summary: null,
      executedAt: at,
    })
    expect(result.orderId).toBeNull()
    expect(result.orderName).toBe("An order")
    expect(result.reason).toBe("Flagged for review")
  })
})

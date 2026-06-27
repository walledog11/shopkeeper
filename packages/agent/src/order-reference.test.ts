import { describe, expect, it } from "vitest";
import type { ShopifyOrderSummary } from "./agent-context.js";
import {
  findOrderByName,
  findReferencedOrder,
  normalizeOrderName,
  referencedOrderName,
} from "./order-reference.js";

const orders: ShopifyOrderSummary[] = [{
  id: "order_1",
  name: "#AB1234",
  created_at: null,
  financial_status: "paid",
  fulfillment_status: "unfulfilled",
  total_price: "10.00",
  items: [],
}];

describe("order references", () => {
  it.each([
    ["ab1234", "#AB1234"],
    ["#ab1234", "#AB1234"],
    ["  #AB1234  ", "#AB1234"],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeOrderName(input)).toBe(expected);
  });

  it.each([
    ["Where is #AB1234?", "#AB1234"],
    ["Where is order 1234?", "#1234"],
    ["Where is order #1234?", "#1234"],
  ])("parses %s", (input, expected) => {
    expect(referencedOrderName(input)).toBe(expected);
  });

  it("matches direct and embedded references against the same canonical form", () => {
    expect(findOrderByName(orders, "ab1234")?.id).toBe("order_1");
    expect(findReferencedOrder(orders, "Please check #ab1234")?.id).toBe("order_1");
  });
});

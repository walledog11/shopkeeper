import { describe, expect, it } from "vitest";
import { lineItemWriteSentence } from "./line-item-display.js";

const item = (name: string, quantity: number, change: string) => ({ name, quantity, change });

describe("lineItemWriteSentence", () => {
  it("names both sides of an exchange", () => {
    expect(lineItemWriteSentence("create_exchange", {
      approval_line_items: [item("Tee - Blue", 1, "return"), item("Tee - Black", 1, "replacement")],
    })).toBe("Exchange 1x Tee - Blue for 1x Tee - Black");
  });

  it("says what an order edit removes, adds, or swaps", () => {
    const removed = item("Napkin - Special", 2, "remove");
    const added = item("Table Runner", 1, "add");

    expect(lineItemWriteSentence("edit_shopify_order", { approval_line_items: [removed, added] }))
      .toBe("Swap 2x Napkin - Special for 1x Table Runner on the order");
    expect(lineItemWriteSentence("edit_shopify_order", { approval_line_items: [removed] }))
      .toBe("Remove 2x Napkin - Special from the order");
    expect(lineItemWriteSentence("edit_shopify_order", { approval_line_items: [added] }))
      .toBe("Add 1x Table Runner to the order");
  });

  it("lists every line a whole-order return covers", () => {
    expect(lineItemWriteSentence("create_return", {
      approval_line_items: [item("Napkin - Special", 1, "return"), item("Napkin - Sample", 2, "return")],
    })).toBe("Open a return for 1x Napkin - Special, 2x Napkin - Sample");
  });

  it("renders nothing for a proposal with no bound items, or a malformed entry", () => {
    expect(lineItemWriteSentence("create_return", { order_id: "1" })).toBeNull();
    expect(lineItemWriteSentence("create_return", { approval_line_items: [item("Napkin", 1, "gift")] })).toBeNull();
    expect(lineItemWriteSentence("cancel_order", { approval_line_items: [item("Napkin", 1, "return")] })).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import type { ActionEntry } from "@shopkeeper/agent/context";
import { getToolChipLabel, getToolChipVariant } from "./tool-action-display";

function action(overrides: Partial<ActionEntry> = {}): ActionEntry {
  return {
    tool: "get_shopify_orders",
    result: "Found 2 orders",
    ...overrides,
  };
}

describe("tool action display", () => {
  it("labels tools with human verbs", () => {
    expect(getToolChipLabel(action({ tool: "get_shopify_orders" }))).toBe("Fetched orders");
    expect(getToolChipLabel(action({ tool: "search_kb" }))).toBe("Searched knowledge base");
  });

  it("styles read-only lookups as muted chips", () => {
    expect(getToolChipVariant(action({ tool: "get_shopify_orders" }))).toBe("read");
    expect(getToolChipVariant(action({ tool: "search_shopify_products", mode: "read_only" }))).toBe("read");
  });

  it("styles confirmed actions as executed", () => {
    expect(getToolChipVariant(action({
      tool: "create_refund",
      category: "action",
      mode: "human_approved",
      result: "Refunded $25.00",
    }))).toBe("executed");
  });

  it("styles unconfirmed action tools as pending", () => {
    expect(getToolChipVariant(action({
      tool: "create_refund",
      category: "action",
      result: "Queued refund",
    }))).toBe("pending");
  });

  it("styles errors distinctly", () => {
    expect(getToolChipVariant(action({ result: "Error: order not found", status: "error" }))).toBe("error");
  });
});

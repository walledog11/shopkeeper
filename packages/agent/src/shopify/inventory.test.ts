import { describe, expect, it } from "vitest";
import { formatInventoryStatusLine, readInventoryStatus } from "./inventory.js";

function product(overrides: Record<string, unknown> = {}) {
  return {
    id: "gid://shopify/Product/1",
    title: "Olive Linen Napkins",
    totalInventory: 12,
    tracksInventory: true,
    variants: {
      nodes: [{
        id: "gid://shopify/ProductVariant/11",
        title: "Set of 4",
        sku: "NAP-4",
        price: "48.00",
        inventoryQuantity: 12,
        inventoryPolicy: "DENY",
      }],
    },
    ...overrides,
  };
}

describe("readInventoryStatus", () => {
  // "0 in stock" and "we do not count this" are different answers, and a
  // merchant deciding whether to promote something needs them kept apart.
  it("reports an untracked variant as untracked, not as zero", () => {
    const [status] = readInventoryStatus({
      products: { nodes: [product({ tracksInventory: false })] },
    });

    expect(status.quantity).toBeNull();
    expect(formatInventoryStatusLine(status)).toContain("not tracked");
  });

  it("surfaces a variant that keeps selling past zero", () => {
    const [status] = readInventoryStatus({
      products: {
        nodes: [product({
          variants: {
            nodes: [{
              id: "gid://shopify/ProductVariant/11",
              title: "Set of 4",
              sku: null,
              price: "48.00",
              inventoryQuantity: 0,
              inventoryPolicy: "CONTINUE",
            }],
          },
        })],
      },
    });

    expect(status.oversellAllowed).toBe(true);
    expect(formatInventoryStatusLine(status)).toContain("oversell allowed");
  });
});

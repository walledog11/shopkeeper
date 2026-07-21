import { afterEach, describe, expect, it, vi } from "vitest";
import { formatLowStockLine, listLowStockVariants } from "./low-stock.js";

const ctx = {
  shop: "test-store.myshopify.com",
  accessToken: "shpat_test",
};

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json", ...init.headers },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("listLowStockVariants", () => {
  it("returns variants at or below the threshold", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse({
      products: [{
        id: 1,
        title: "Canvas Hat",
        variants: [
          { id: 10, title: "Blue", inventory_quantity: 2 },
          { id: 11, title: "Red", inventory_quantity: 12 },
        ],
      }, {
        id: 2,
        title: "Classic Tee",
        variants: [{ id: 20, title: "M", inventory_quantity: 1 }],
      }],
    })));

    await expect(listLowStockVariants(ctx, 5)).resolves.toEqual([
      { productTitle: "Canvas Hat", variantTitle: "Blue", inventoryQuantity: 2 },
      { productTitle: "Classic Tee", variantTitle: "M", inventoryQuantity: 1 },
    ]);
  });
});

describe("formatLowStockLine", () => {
  it("formats a digest line for low-stock variants", () => {
    const line = formatLowStockLine([
      { productTitle: "Canvas Hat", variantTitle: "Blue", inventoryQuantity: 2 },
      { productTitle: "Classic Tee", variantTitle: "M", inventoryQuantity: 1 },
    ], 5);

    expect(line).toBe(
      "Low stock (≤5): Canvas Hat (Blue) · 2 left · Classic Tee (M) · 1 left",
    );
  });

  it("returns null when there are no low-stock variants", () => {
    expect(formatLowStockLine([], 5)).toBeNull();
  });
});

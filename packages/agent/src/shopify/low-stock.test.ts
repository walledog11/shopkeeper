import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse } from "../testing/json-response.js";
import { listLowStockVariants } from "./low-stock.js";

const ctx = {
  shop: "test-store.myshopify.com",
  accessToken: "shpat_test",
};

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

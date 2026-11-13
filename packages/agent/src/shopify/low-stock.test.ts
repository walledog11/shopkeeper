import { afterEach, describe, expect, it, vi } from "vitest";
import { graphqlRequest, graphqlResponse } from "../testing/shopify-graphql.js";
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
    const fetchMock = vi.fn().mockResolvedValueOnce(graphqlResponse({
      productVariants: {
        nodes: [
          { title: "Blue", inventoryQuantity: 2, product: { title: "Canvas Hat" } },
          { title: "M", inventoryQuantity: 1, product: { title: "Classic Tee" } },
        ],
      },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(listLowStockVariants(ctx, 5)).resolves.toEqual([
      { productTitle: "Canvas Hat", variantTitle: "Blue", inventoryQuantity: 2 },
      { productTitle: "Classic Tee", variantTitle: "M", inventoryQuantity: 1 },
    ]);
    expect(graphqlRequest(fetchMock.mock.calls[0]?.[1])?.variables).toMatchObject({
      query: "inventory_quantity:<=5",
      first: 5,
    });
  });
});

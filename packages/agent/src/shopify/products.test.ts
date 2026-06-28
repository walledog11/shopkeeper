import { afterEach, describe, expect, it, vi } from "vitest";
import { searchShopifyProducts } from "./products.js";

const ctx = {
  shop: "test-store.myshopify.com",
  accessToken: "shpat_test",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("searchShopifyProducts", () => {
  it("validates a non-empty query without calling Shopify", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchShopifyProducts({ query: "   " }, ctx);

    expect(result.status).toBe("error");
    expect(result.message).toContain("query is required");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("clamps the requested limit to the provider maximum", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ products: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await searchShopifyProducts({ query: "hat", limit: 99 }, ctx);

    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.searchParams.get("limit")).toBe("10");
    expect(url.searchParams.get("title")).toBe("hat");
  });

  it("returns not_found for no results", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ products: [] })));

    await expect(searchShopifyProducts({ query: "rare hat" }, ctx)).resolves.toEqual({
      status: "not_found",
      message: 'No products found matching "rare hat".',
    });
  });

  it("serializes product and variant identifiers", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      products: [{
        id: 123,
        title: "Canvas Hat",
        variants: [{ id: 456, title: "Blue", price: "25.00", inventory_quantity: 4 }],
      }],
    })));

    const result = await searchShopifyProducts({ query: "hat", limit: 5 }, ctx);

    expect(JSON.parse(result.message)).toEqual([{
      product_id: "123",
      title: "Canvas Hat",
      variants: [{
        variant_id: "456",
        title: "Blue",
        price: "25.00",
        inventory_quantity: 4,
      }],
    }]);
  });

  it("surfaces Shopify provider errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ errors: "Unavailable" }, 503)));

    const result = await searchShopifyProducts({ query: "hat" }, ctx);

    expect(result.status).toBe("error");
    expect(result.message).toContain("could not search products (503) - Unavailable");
  });
});

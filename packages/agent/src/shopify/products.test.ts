import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse } from "../testing/json-response.js";
import { searchShopifyProducts } from "./products.js";

const ctx = {
  shop: "test-store.myshopify.com",
  accessToken: "shpat_test",
};

function productsResponse(nodes: unknown[]): Response {
  return jsonResponse({ data: { products: { nodes } } });
}

function sentVariables(fetchMock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  return JSON.parse(String(fetchMock.mock.calls[0][1].body)).variables;
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

  it("searches rather than matching a title exactly", async () => {
    const fetchMock = vi.fn().mockResolvedValue(productsResponse([]));
    vi.stubGlobal("fetch", fetchMock);

    await searchShopifyProducts({ query: "snowboard" }, ctx);

    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.pathname).toContain("graphql.json");
    // The REST `title=` filter this replaced was exact equality, so a bare noun
    // matched nothing on a store that sells the thing.
    expect(url.searchParams.get("title")).toBeNull();
    expect(sentVariables(fetchMock).query).toBe("snowboard");
  });

  it("clamps the requested limit to the provider maximum", async () => {
    const fetchMock = vi.fn().mockResolvedValue(productsResponse([]));
    vi.stubGlobal("fetch", fetchMock);

    await searchShopifyProducts({ query: "hat", limit: 99 }, ctx);

    expect(sentVariables(fetchMock).first).toBe(10);
  });

  it("strips search operators so a title containing a colon still matches", async () => {
    const fetchMock = vi.fn().mockResolvedValue(productsResponse([]));
    vi.stubGlobal("fetch", fetchMock);

    await searchShopifyProducts({ query: 'The Collection Snowboard: "Liquid"' }, ctx);

    expect(sentVariables(fetchMock).query).toBe("The Collection Snowboard Liquid");
  });

  it("returns not_found for no results", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(productsResponse([])));

    await expect(searchShopifyProducts({ query: "rare hat" }, ctx)).resolves.toEqual({
      status: "not_found",
      message: 'No products found matching "rare hat".',
    });
  });

  it("serializes product and variant identifiers", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(productsResponse([{
      id: "gid://shopify/Product/123",
      title: "Canvas Hat",
      variants: {
        nodes: [{
          id: "gid://shopify/ProductVariant/456",
          title: "Blue",
          price: "25.00",
          inventoryQuantity: 4,
        }],
      },
    }])));

    const result = await searchShopifyProducts({ query: "hat", limit: 5 }, ctx);

    // Identical to what the REST implementation produced, so the tool result the
    // model sees is unchanged.
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

  it("restricts storefront results to published active products and omits internal stock counts", async () => {
    const product = {
      id: "gid://shopify/Product/123", title: "Public hat", status: "ACTIVE", onlineStoreUrl: "https://shop.example/products/hat",
      variants: { nodes: [{ id: "gid://shopify/ProductVariant/456", title: "Blue", price: "25.00", inventoryQuantity: 42 }] },
    };
    const fetchMock = vi.fn().mockResolvedValue(productsResponse([
      product, { ...product, title: "Draft hat", status: "DRAFT" }, { ...product, title: "Private hat", onlineStoreUrl: null },
    ]));
    vi.stubGlobal("fetch", fetchMock);
    const result = await searchShopifyProducts({ query: 'hat OR (status:draft)' }, ctx, true);
    expect(sentVariables(fetchMock)).toMatchObject({ storefront: true, query: 'status:active AND published_status:published AND (hat OR status draft)' });
    expect(JSON.parse(result.message)).toEqual([{
      product_id: "123", title: "Public hat", url: product.onlineStoreUrl,
      variants: [{ variant_id: "456", title: "Blue", price: "25.00" }],
    }]);
  });

  it("defaults a missing inventory quantity to null", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(productsResponse([{
      id: "gid://shopify/Product/123",
      title: "Untracked Board",
      variants: { nodes: [{ id: "gid://shopify/ProductVariant/456", title: "Default", price: "10.00" }] },
    }])));

    const result = await searchShopifyProducts({ query: "board" }, ctx);

    expect(JSON.parse(result.message)[0].variants[0].inventory_quantity).toBeNull();
  });

  it("surfaces Shopify provider errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ errors: "Unavailable" }, 503)));

    const result = await searchShopifyProducts({ query: "hat" }, ctx);

    expect(result.status).toBe("error");
    expect(result.message).toContain("could not search products (503) - Unavailable");
  });

  it("surfaces GraphQL errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      errors: [{ message: "Field 'nope' doesn't exist" }],
    })));

    const result = await searchShopifyProducts({ query: "hat" }, ctx);

    expect(result.status).toBe("error");
    expect(result.message).toContain("could not search products");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse } from "../testing/json-response.js";
import { setVariantPrices } from "./variant-pricing.js";

const ctx = { shop: "test-store.myshopify.com", accessToken: "shpat_test" };

/** The two calls a successful reprice makes, in order. */
function successfulFetch(price = "48.00") {
  return vi.fn()
    .mockResolvedValueOnce(jsonResponse({
      data: {
        nodes: [{
          id: "gid://shopify/ProductVariant/1",
          price,
          product: { id: "gid://shopify/Product/1" },
        }],
      },
    }))
    .mockResolvedValueOnce(jsonResponse({
      data: {
        productVariantsBulkUpdate: {
          productVariants: [{ id: "gid://shopify/ProductVariant/1", price: "44.00" }],
          userErrors: [],
        },
      },
    }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("setVariantPrices", () => {
  it("records the original prices alongside the change", async () => {
    vi.stubGlobal("fetch", successfulFetch());

    const result = await setVariantPrices(
      {
        prices: [{ variant_id: "gid://shopify/ProductVariant/1", price: 44 }],
      },
      ctx,
    );

    expect(result.status).toBe("ok");
    expect(result.message).toContain("$48.00 -> $44.00");
    expect(result.data).toEqual({
      priceChanges: [{
        variantId: "gid://shopify/ProductVariant/1",
        originalPriceCents: 4_800,
        newPriceCents: 4_400,
      }],
    });
  });

  it("changes nothing when a named variant does not exist", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ data: { nodes: [] } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await setVariantPrices(
      {
        prices: [{ variant_id: "gid://shopify/ProductVariant/404", price: 10 }],
      },
      ctx,
    );

    expect(result.status).toBe("error");
    expect(result.message).toContain("no price was changed");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // The model writes the bare number first on almost every reprice. Before this
  // it cost a round-trip to Shopify's `Invalid global id` and a retry, which is
  // two wasted iterations against the turn's token budget.
  it("accepts a bare numeric variant id as the full gid", async () => {
    vi.stubGlobal("fetch", successfulFetch());

    const result = await setVariantPrices(
      { prices: [{ variant_id: "1", price: 44 }] },
      ctx,
    );

    expect(result.status).toBe("ok");
    expect(result.data).toEqual({
      priceChanges: [{
        variantId: "gid://shopify/ProductVariant/1",
        originalPriceCents: 4_800,
        newPriceCents: 4_400,
      }],
    });
  });

  // An id the model invented out of option names never reaches the network.
  it("rejects a non-numeric variant id without calling Shopify", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await setVariantPrices(
      {
        prices: [{ variant_id: "gid://shopify/ProductVariant/Medium-Sand", price: 148 }],
      },
      ctx,
    );

    expect(result.status).toBe("error");
    expect(result.message).toContain("Medium-Sand");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects the same variant named twice", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await setVariantPrices(
      {
        prices: [
          { variant_id: "gid://shopify/ProductVariant/1", price: 10 },
          { variant_id: "gid://shopify/ProductVariant/1", price: 20 },
        ],
      },
      ctx,
    );

    expect(result.status).toBe("error");
    expect(result.message).toContain("more than once");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an empty price list before touching Shopify", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await setVariantPrices(
      { prices: [] },
      ctx,
    );

    expect(result.status).toBe("error");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // A partial bulk failure must still hand back what the prices were, or the
  // merchant has a half-repriced catalogue and no record of the originals.
  it("reports a lost mutation confirmation as unknown, not as a failure", async () => {
    // A definite failure earns a replan; this one may already have committed,
    // so it must not.
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        data: {
          nodes: [{
            id: "gid://shopify/ProductVariant/1",
            price: "48.00",
            product: { id: "gid://shopify/Product/1" },
          }],
        },
      }))
      .mockRejectedValueOnce(new TypeError("connection reset")));

    const result = await setVariantPrices(
      { prices: [{ variant_id: "gid://shopify/ProductVariant/1", price: 44 }] },
      ctx,
    );

    expect(result.status).toBe("unknown");
    expect(result.message).toContain("Check the store's prices before repricing again");
    // The original prices are the only record of what to restore.
    expect(result.message).toContain("48.00");
  });

  it("names the products already repriced when contact is lost mid-loop", async () => {
    const variant = (id: string, productId: string) => ({
      id: `gid://shopify/ProductVariant/${id}`,
      price: "48.00",
      product: { id: `gid://shopify/Product/${productId}` },
    });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: { nodes: [variant("1", "1"), variant("2", "2")] } }))
      // One product commits, the next never answers.
      .mockResolvedValueOnce(jsonResponse({
        data: {
          productVariantsBulkUpdate: {
            productVariants: [{ id: "gid://shopify/ProductVariant/1", price: "44.00" }],
            userErrors: [],
          },
        },
      }))
      .mockRejectedValueOnce(new TypeError("connection reset")));

    const result = await setVariantPrices(
      {
        prices: [
          { variant_id: "gid://shopify/ProductVariant/1", price: 44 },
          { variant_id: "gid://shopify/ProductVariant/2", price: 44 },
        ],
      },
      ctx,
    );

    expect(result.status).toBe("unknown");
    expect(result.message).toContain("gid://shopify/ProductVariant/1");
  });

  it("reports the original prices when the update fails partway", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        data: {
          nodes: [{
            id: "gid://shopify/ProductVariant/1",
            price: "48.00",
            product: { id: "gid://shopify/Product/1" },
          }],
        },
      }))
      .mockResolvedValueOnce(jsonResponse({
        data: {
          productVariantsBulkUpdate: {
            productVariants: [],
            userErrors: [{ field: ["price"], message: "Price is invalid" }],
          },
        },
      })));

    const result = await setVariantPrices(
      {
        prices: [{ variant_id: "gid://shopify/ProductVariant/1", price: 44 }],
      },
      ctx,
    );

    expect(result.status).toBe("error");
    expect(result.message).toContain("$48.00 -> $44.00");
  });
});

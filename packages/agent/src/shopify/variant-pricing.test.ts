import { afterEach, describe, expect, it, vi } from "vitest";
import { deepestMarkdownPercent, setVariantPrices } from "./variant-pricing.js";
import { resolveAgentSettings } from "../settings.js";

const ctx = { shop: "test-store.myshopify.com", accessToken: "shpat_test" };
const NOW = new Date("2026-04-29T12:00:00Z");
const SETTINGS = resolveAgentSettings(null);

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/** The three calls a successful reprice makes, in order. */
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
        nodes: [{
          id: "gid://shopify/ProductVariant/1",
          title: "Set of 4",
          price,
          inventoryQuantity: 2,
          product: { title: "Olive Linen Napkins" },
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

describe("deepestMarkdownPercent", () => {
  // Averaging would let one catastrophic cut hide behind mild ones.
  it("takes the steepest cut, not the average", () => {
    expect(deepestMarkdownPercent([
      { variantId: "a", originalPriceCents: 10_000, newPriceCents: 9_500 },
      { variantId: "b", originalPriceCents: 10_000, newPriceCents: 1_000 },
    ])).toBe(90);
  });

  it("treats a price increase as no markdown", () => {
    expect(deepestMarkdownPercent([
      { variantId: "a", originalPriceCents: 1_000, newPriceCents: 2_000 },
    ])).toBe(0);
  });

  it("ignores a variant that had no price to cut", () => {
    expect(deepestMarkdownPercent([
      { variantId: "a", originalPriceCents: 0, newPriceCents: 0 },
    ])).toBe(0);
  });
});

describe("setVariantPrices", () => {
  it("records the original prices alongside the change", async () => {
    vi.stubGlobal("fetch", successfulFetch());

    const result = await setVariantPrices(
      {
        prices: [{ variant_id: "gid://shopify/ProductVariant/1", price: 44 }],
        revisit_in_hours: 72,
      },
      ctx,
      SETTINGS,
      NOW,
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

  // A permanent 90% cut is the same exposure as a temporary one, so the guard
  // applies to repricing too.
  it("refuses a markdown deeper than the guard allows", async () => {
    const fetchMock = successfulFetch();
    vi.stubGlobal("fetch", fetchMock);

    const result = await setVariantPrices(
      {
        prices: [{ variant_id: "gid://shopify/ProductVariant/1", price: 4.8 }],
        revisit_in_hours: 72,
      },
      ctx,
      SETTINGS,
      NOW,
    );

    expect(result.status).toBe("error");
    expect(result.message).toContain("nothing was applied");
    // Two reads happened; the update did not.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("refuses when the guard has no revisit horizon to bound the change", async () => {
    const fetchMock = successfulFetch();
    vi.stubGlobal("fetch", fetchMock);

    const result = await setVariantPrices(
      { prices: [{ variant_id: "gid://shopify/ProductVariant/1", price: 44 }] },
      ctx,
      SETTINGS,
      NOW,
    );

    expect(result.status).toBe("error");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("changes nothing when a named variant does not exist", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ data: { nodes: [] } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await setVariantPrices(
      {
        prices: [{ variant_id: "gid://shopify/ProductVariant/404", price: 10 }],
        revisit_in_hours: 24,
      },
      ctx,
      SETTINGS,
      NOW,
    );

    expect(result.status).toBe("error");
    expect(result.message).toContain("no price was changed");
    expect(fetchMock).toHaveBeenCalledTimes(1);
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
        revisit_in_hours: 24,
      },
      ctx,
      SETTINGS,
      NOW,
    );

    expect(result.status).toBe("error");
    expect(result.message).toContain("more than once");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an empty price list before touching Shopify", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await setVariantPrices(
      { prices: [], revisit_in_hours: 24 },
      ctx,
      SETTINGS,
      NOW,
    );

    expect(result.status).toBe("error");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // A partial bulk failure must still hand back what the prices were, or the
  // merchant has a half-repriced catalogue and no record of the originals.
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
          nodes: [{
            id: "gid://shopify/ProductVariant/1",
            title: "Set of 4",
            price: "48.00",
            inventoryQuantity: 2,
            product: { title: "Olive Linen Napkins" },
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
        revisit_in_hours: 72,
      },
      ctx,
      SETTINGS,
      NOW,
    );

    expect(result.status).toBe("error");
    expect(result.message).toContain("$48.00 -> $44.00");
  });
});

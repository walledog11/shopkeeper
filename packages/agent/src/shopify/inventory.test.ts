import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse } from "../testing/json-response.js";
import {
  formatInventoryStatusLine,
  getInventoryStatus,
  readInventoryStatus,
} from "./inventory.js";

const ctx = {
  shop: "test-store.myshopify.com",
  accessToken: "shpat_test",
};

function productsResponse(nodes: unknown[]): Response {
  return jsonResponse({ data: { products: { nodes } } });
}

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

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("readInventoryStatus", () => {
  it("flattens products to priced variant rows", () => {
    const [status] = readInventoryStatus({ products: { nodes: [product()] } });

    expect(status).toEqual({
      variantId: "gid://shopify/ProductVariant/11",
      productTitle: "Olive Linen Napkins",
      variantTitle: "Set of 4",
      sku: "NAP-4",
      priceCents: 4_800,
      quantity: 12,
      oversellAllowed: false,
    });
  });

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
    expect(formatInventoryStatusLine(status)).toBe("Olive Linen Napkins (Set of 4): 0 in stock, oversell allowed");
  });

  it("skips the variant label when Shopify uses its placeholder title", () => {
    const [status] = readInventoryStatus({
      products: {
        nodes: [product({
          variants: {
            nodes: [{
              id: "gid://shopify/ProductVariant/11",
              title: "Default Title",
              sku: null,
              price: "48.00",
              inventoryQuantity: 3,
              inventoryPolicy: "DENY",
            }],
          },
        })],
      },
    });

    expect(formatInventoryStatusLine(status)).toBe("Olive Linen Napkins: 3 in stock");
  });

  it("tolerates a product with no variants", () => {
    expect(readInventoryStatus({ products: { nodes: [product({ variants: null })] } })).toEqual([]);
  });
});

describe("getInventoryStatus", () => {
  it("validates a blank query without calling Shopify", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(getInventoryStatus({ query: "   " }, ctx)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports stock for a named product", async () => {
    const fetchMock = vi.fn().mockResolvedValue(productsResponse([product()]));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getInventoryStatus({ query: "napkins" }, ctx);

    expect(result.status).toBe("ok");
    expect(result.message).toContain("12 in stock");
  });

  it("says so plainly when nothing matches", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(productsResponse([])));

    const result = await getInventoryStatus({ query: "ghost" }, ctx);

    expect(result.status).toBe("not_found");
  });

  // Omitting the query is the second question the tool answers, so it must not
  // fall through to an unbounded catalog dump.
  it("lists low stock when no query is given", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      products: [{
        id: 1,
        title: "Olive Linen Napkins",
        variants: [{ id: 11, title: "Set of 4", price: "48.00", inventory_quantity: 2 }],
      }],
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getInventoryStatus({ low_stock_threshold: 5 }, ctx);

    expect(result.status).toBe("ok");
    expect(result.message).toContain("at or below 5 units");
    expect(result.message).toContain("2 in stock");
  });

  it("reports an empty low-stock list as good news, not as nothing found", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ products: [] })));

    const result = await getInventoryStatus({}, ctx);

    expect(result.status).toBe("ok");
    expect(result.message).toContain("Nothing is at or below 5 units");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse } from "../testing/json-response.js";
import { createFlashSale, endFlashSale, readFlashSales } from "./flash-sales.js";

const ctx = { shop: "test-store.myshopify.com", accessToken: "shpat_test" };
const NOW = new Date("2026-04-29T12:00:00Z");

function variantNode(id: string, price = "48.00", inventoryQuantity = 4) {
  return {
    id,
    title: "Set of 4",
    price,
    inventoryQuantity,
    product: { title: "Olive Linen Napkins" },
  };
}

function variantIds(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `gid://shopify/ProductVariant/${i + 1}`);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("createFlashSale", () => {
  it("creates an automatic discount with an end date", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        data: { nodes: [variantNode("gid://shopify/ProductVariant/1")] },
      }))
      .mockResolvedValueOnce(jsonResponse({
        data: {
          discountAutomaticBasicCreate: {
            automaticDiscountNode: { id: "gid://shopify/DiscountAutomaticNode/9" },
            userErrors: [],
          },
        },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createFlashSale(
      {
        variant_ids: ["gid://shopify/ProductVariant/1"],
        discount_percentage: 20,
        duration_hours: 24,
        name: "Weekend",
      },
      ctx,
      NOW,
    );

    expect(result.status).toBe("ok");
    const sent = JSON.parse(String(fetchMock.mock.calls[1][1].body)).variables;
    expect(sent.automaticBasicDiscount.endsAt).toBe("2026-04-30T12:00:00.000Z");
    expect(result.message).toContain("End it early with end_flash_sale");
  });

  // The Milestone 7 acceptance criterion, at the tool boundary rather than only
  // in the guard's unit test.
  it("reports a lost create confirmation as unknown, not as a failure", async () => {
    // Reported as a definite failure this earns a replan, and the replan would
    // stack a second markdown on the same variants.
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        data: { nodes: [variantNode("gid://shopify/ProductVariant/1")] },
      }))
      .mockRejectedValueOnce(new TypeError("connection reset")));

    const result = await createFlashSale(
      {
        variant_ids: ["gid://shopify/ProductVariant/1"],
        discount_percentage: 20,
        duration_hours: 24,
      },
      ctx,
      NOW,
    );

    expect(result.status).toBe("unknown");
    expect(result.message).toContain("before starting another");
  });

  it("refuses when a named variant does not exist", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse({
      data: { nodes: [variantNode("gid://shopify/ProductVariant/1")] },
    })));

    const result = await createFlashSale(
      {
        variant_ids: ["gid://shopify/ProductVariant/1", "gid://shopify/ProductVariant/404"],
        discount_percentage: 10,
        duration_hours: 4,
      },
      ctx,
      NOW,
    );

    expect(result.status).toBe("error");
    expect(result.message).toContain("do not exist");
  });

  it("rejects a sale with no duration before touching Shopify", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await createFlashSale(
      { variant_ids: variantIds(1), discount_percentage: 10, duration_hours: 0 },
      ctx,
      NOW,
    );

    expect(result.status).toBe("error");
    expect(result.message).toContain("duration_hours");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an empty variant list before touching Shopify", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await createFlashSale(
      { variant_ids: [], discount_percentage: 10, duration_hours: 4 },
      ctx,
      NOW,
    );

    expect(result.status).toBe("error");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("endFlashSale", () => {
  it("ends a sale by id and says prices need no undoing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      data: {
        discountAutomaticDelete: {
          deletedAutomaticDiscountId: "gid://shopify/DiscountAutomaticNode/9",
          userErrors: [],
        },
      },
    })));

    const result = await endFlashSale({ flash_sale_id: "gid://shopify/DiscountAutomaticNode/9" }, ctx);

    expect(result.status).toBe("ok");
    expect(result.message).toContain("nothing needs undoing");
  });

  // "Ended with one command" has to hold when the merchant does not know the
  // ID, which on a phone is most of the time.
  it("reports a lost end confirmation as unknown, so the sale is not assumed over", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("connection reset")));

    const result = await endFlashSale({ flash_sale_id: "gid://shopify/DiscountAutomaticNode/9" }, ctx);

    expect(result.status).toBe("unknown");
    expect(result.message).toContain("it may still be running");
  });

  it("lists what is running when no id is given", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      data: {
        discountNodes: {
          nodes: [{
            id: "gid://shopify/DiscountAutomaticNode/9",
            discount: {
              title: "Shopkeeper flash sale: Weekend",
              status: "ACTIVE",
              endsAt: "2026-04-30T12:00:00Z",
            },
          }],
        },
      },
    })));

    const result = await endFlashSale({}, ctx);

    expect(result.status).toBe("ok");
    expect(result.message).toContain("Shopkeeper flash sale: Weekend");
    expect(result.message).toContain("gid://shopify/DiscountAutomaticNode/9");
  });

  it("reports a missing sale rather than claiming success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      data: { discountAutomaticDelete: { deletedAutomaticDiscountId: null, userErrors: [] } },
    })));

    const result = await endFlashSale({ flash_sale_id: "gid://shopify/DiscountAutomaticNode/404" }, ctx);

    expect(result.status).toBe("not_found");
  });
});

describe("readFlashSales", () => {
  it("skips nodes Shopify returned without a usable discount", () => {
    expect(readFlashSales({
      discountNodes: {
        nodes: [
          null,
          { id: "gid://1", discount: null },
          { id: null, discount: { title: "x" } },
          { id: "gid://2", discount: { title: "Real", status: "ACTIVE", endsAt: null } },
        ],
      },
    })).toEqual([{ id: "gid://2", title: "Real", status: "ACTIVE", endsAt: null }]);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { shopifyRest, shopifyRestJson, ShopifyRequestError } from "./client.js";
import {
  SHOPIFY_SIMULATOR_DOMAIN,
  handleShopifySimulatorRest,
  isShopifySimulatorContext,
  resetShopifySimulatorStore,
} from "./simulator-store.js";

const ctx = { shop: SHOPIFY_SIMULATOR_DOMAIN, accessToken: "shopkeeper-development-simulator" };

afterEach(() => {
  resetShopifySimulatorStore();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Shopify simulator store", () => {
  it("recognizes the local demo shop and ignores real shops", () => {
    expect(isShopifySimulatorContext({ shop: SHOPIFY_SIMULATOR_DOMAIN })).toBe(true);
    expect(isShopifySimulatorContext({ shop: `https://${SHOPIFY_SIMULATOR_DOMAIN}/admin` })).toBe(true);
    expect(isShopifySimulatorContext({ shop: "palette-dev.myshopify.com" })).toBe(false);
  });

  it("fills every orders-board column without calling the network", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const unfulfilled = await shopifyRestJson<{ orders: { financial_status: string; fulfillment_status: string | null }[] }>(
      ctx,
      "orders.json",
      { query: { fulfillment_status: "unfulfilled" } },
    );
    const unpaid = await shopifyRestJson<{ orders: { financial_status: string }[] }>(
      ctx,
      "orders.json",
      { query: { financial_status: "unpaid" } },
    );
    const fulfilled = await shopifyRestJson<{ orders: { fulfillment_status: string | null }[] }>(
      ctx,
      "orders.json",
      { query: { fulfillment_status: "shipped" } },
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(unfulfilled.orders.length).toBeGreaterThan(0);
    expect(unpaid.orders.length).toBeGreaterThan(0);
    expect(fulfilled.orders.length).toBeGreaterThan(0);
    expect(unpaid.orders.every((order) => ["pending", "authorized", "partially_paid"].includes(order.financial_status))).toBe(true);
    expect(fulfilled.orders.every((order) => order.fulfillment_status === "fulfilled")).toBe(true);
  });

  it("lists customers and returns a named customer with their orders", async () => {
    const customers = await shopifyRestJson<{ customers: { id: number; email: string; orders_count: number }[] }>(
      ctx,
      "customers.json",
    );
    const maya = customers.customers.find((customer) => customer.email === "maya.ellison@example.com");
    expect(maya?.orders_count).toBeGreaterThan(1);

    const detail = await shopifyRestJson<{ customer: { first_name: string } }>(ctx, `customers/${maya!.id}.json`);
    expect(detail.customer.first_name).toBe("Maya");

    const orders = await shopifyRestJson<{ orders: { name: string }[] }>(
      ctx,
      "orders.json",
      { query: { customer_id: maya!.id } },
    );
    expect(orders.orders.length).toBe(maya!.orders_count);
  });

  it("searches customers and orders the way the dashboard does", async () => {
    const byEmail = await shopifyRestJson<{ customers: { email: string }[] }>(
      ctx,
      "customers/search.json",
      { query: { query: "email:devon.park@example.com" } },
    );
    expect(byEmail.customers.map((customer) => customer.email)).toEqual(["devon.park@example.com"]);

    const byName = await shopifyRestJson<{ orders: { name: string }[] }>(
      ctx,
      "orders.json",
      { query: { name: "1042" } },
    );
    expect(byName.orders.map((order) => order.name)).toEqual(["#1042"]);
  });

  it("applies in-memory customer edits", async () => {
    await shopifyRestJson(ctx, "customers/1006.json", {
      method: "PUT",
      body: {
        customer: {
          first_name: "Malik",
          last_name: "Hassan",
          email: "malik.hassan@example.com",
          addresses: [{ address1: "9 Oak Lane", city: "Oak Park", province: "IL", zip: "60302", country: "United States" }],
        },
      },
    });

    const detail = await shopifyRestJson<{ customer: { default_address: { address1: string; city: string } } }>(
      ctx,
      "customers/1006.json",
    );
    expect(detail.customer.default_address).toMatchObject({ address1: "9 Oak Lane", city: "Oak Park" });
  });

  it("paginates list endpoints with a Link cursor", async () => {
    const page = await shopifyRest<{ orders: unknown[] }>(ctx, "orders.json", { query: { limit: 3 } });
    expect(page.data.orders).toHaveLength(3);
    expect(page.headers.get("link")).toMatch(/page_info=sim:3/);
  });

  it("returns 404 for unknown simulator paths without touching fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(shopifyRestJson(ctx, "gift_cards.json")).rejects.toBeInstanceOf(ShopifyRequestError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not intercept a real Shopify shop", () => {
    expect(handleShopifySimulatorRest({ shop: "example.myshopify.com" }, "orders.json")).toBeNull();
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { ShopifyRequestError, shopifyRestJson } from "./client.js";

const ctx = { shop: "example.myshopify.com", accessToken: "test-token" };

function response(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "retry-after": "0" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Shopify request retry policy", () => {
  it("retries a safe GET once after a retryable response", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ errors: "temporarily unavailable" }, 503))
      .mockResolvedValueOnce(response({ orders: [] }, 200));
    vi.stubGlobal("fetch", fetchMock);

    await expect(shopifyRestJson(ctx, "orders.json")).resolves.toEqual({ orders: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each(["POST", "PUT", "DELETE"] as const)(
    "does not implicitly retry a %s mutation after a retryable response",
    async (method) => {
      const fetchMock = vi.fn().mockResolvedValue(
        response({ errors: "ambiguous provider failure" }, 503),
      );
      vi.stubGlobal("fetch", fetchMock);

      await expect(shopifyRestJson(ctx, "orders/1.json", {
        method,
        body: { order: { note: "updated" } },
      })).rejects.toBeInstanceOf(ShopifyRequestError);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it("allows an explicit retry policy for an operation that owns idempotency", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ errors: "temporarily unavailable" }, 503))
      .mockResolvedValueOnce(response({ order: { id: 1 } }, 200));
    vi.stubGlobal("fetch", fetchMock);

    await expect(shopifyRestJson(ctx, "orders.json", {
      method: "POST",
      body: { order: {} },
      maxRetries: 1,
    })).resolves.toEqual({ order: { id: 1 } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

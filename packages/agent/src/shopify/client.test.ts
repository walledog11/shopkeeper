import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isAmbiguousShopifyMutationError,
  SHOPIFY_TAG_MAX_LENGTH,
  ShopifyRequestError,
  shopifyGraphql,
  shopifyOperationTag,
  shopifyRestJson,
} from "./client.js";

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

async function graphqlError(body: unknown, status = 200): Promise<ShopifyRequestError> {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(body, status)));
  const err = await shopifyGraphql(ctx, "mutation { x }", {}).catch((e) => e);
  expect(err).toBeInstanceOf(ShopifyRequestError);
  return err as ShopifyRequestError;
}

describe("GraphQL mutation ambiguity", () => {
  // The shape of the create_refund defect: Shopify rejects the document at
  // validation, so no `data` key comes back and nothing executed.
  it("treats a rejected document as definitely not executed", async () => {
    const err = await graphqlError({
      errors: [{ message: "Field 'code' doesn't exist on type 'UserError'" }],
    });

    expect(err.rejectedBeforeExecution).toBe(true);
    expect(isAmbiguousShopifyMutationError(err)).toBe(false);
  });

  it("keeps a throttled request ambiguous even though it also omits data", async () => {
    const err = await graphqlError({
      errors: [{ message: "Throttled", extensions: { code: "THROTTLED" } }],
    });

    expect(err.rejectedBeforeExecution).toBe(false);
    expect(isAmbiguousShopifyMutationError(err)).toBe(true);
  });

  it("keeps an execution error ambiguous, because a side effect can precede it", async () => {
    const err = await graphqlError({
      data: null,
      errors: [{ message: "Internal error. Looks like something went wrong on our end." }],
    });

    expect(err.rejectedBeforeExecution).toBe(false);
    expect(isAmbiguousShopifyMutationError(err)).toBe(true);
  });

  it("keeps a 5xx ambiguous", async () => {
    const err = await graphqlError({ errors: "service unavailable" }, 503);

    expect(err.rejectedBeforeExecution).toBeUndefined();
    expect(isAmbiguousShopifyMutationError(err)).toBe(true);
  });

  it("reports the error code, not just the message", async () => {
    const err = await graphqlError({
      errors: [{ message: "Throttled", extensions: { code: "THROTTLED" } }],
    });

    expect(err.payload).toBe("Throttled (THROTTLED)");
  });
});

describe("shopifyOperationTag", () => {
  // The defect this pins: the tag was the prefix plus the raw 36-character
  // idempotency key, 50 characters against Shopify's 40-character cap, so every
  // create_shopify_order came back 422 "Order tags is invalid".
  it("stays inside Shopify's tag length cap", () => {
    for (const operationId of ["execution-1:create_order", "a", "x".repeat(500)]) {
      expect(shopifyOperationTag(operationId).length).toBeLessThanOrEqual(SHOPIFY_TAG_MAX_LENGTH);
    }
    expect(shopifyOperationTag().length).toBeLessThanOrEqual(SHOPIFY_TAG_MAX_LENGTH);
  });

  // The writer stamps it and the probe searches for it; a tag Shopify's `tag:`
  // search cannot round-trip would reconcile every created order as no_effect.
  it("is stable per operation and free of separator characters", () => {
    const tag = shopifyOperationTag("execution-1:create_order");

    expect(tag).toBe(shopifyOperationTag("execution-1:create_order"));
    expect(tag).not.toBe(shopifyOperationTag("execution-2:create_order"));
    expect(tag).toMatch(/^shopkeeper-op-[0-9a-f]+$/);
  });

  it("gives an unidentified operation its own tag rather than a shared one", () => {
    expect(shopifyOperationTag()).not.toBe(shopifyOperationTag());
  });
});

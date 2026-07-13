import { afterEach, describe, expect, it, vi } from "vitest";
import { createGiftCard } from "./gift-cards.js";
import { shopifyIdempotencyKey } from "./client.js";

const ctx = {
  shop: "test-store.myshopify.com",
  accessToken: "shpat_test",
  operationId: "execution-1:create-gift-card",
};

const expectedCode = shopifyIdempotencyKey(ctx.operationId).replaceAll("-", "").slice(0, 20);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("createGiftCard", () => {
  it("validates the amount before calling Shopify", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await createGiftCard({ amount: "0" }, ctx);

    expect(result.status).toBe("error");
    expect(result.spentCents).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("creates the gift card with customer, note, and expiry and surfaces the code", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-06T12:00:00.000Z"));
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: {
        giftCardCreate: {
          giftCardCode: expectedCode,
          giftCard: {
            id: "gid://shopify/GiftCard/9001",
            expiresOn: "2026-10-04",
            note: `Goodwill: damaged item\nShopkeeper operation: ${expectedCode}`,
            initialValue: { amount: "25.00" },
            customer: { id: "gid://shopify/Customer/1001" },
          },
          userErrors: [],
        },
      },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createGiftCard(
      { amount: "25.00", customer_id: "1001", reason: "damaged item", expires_in_days: 90 },
      ctx,
    );

    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(request.variables.input).toEqual({
      initialValue: "25.00",
      code: expectedCode,
      customerId: "gid://shopify/Customer/1001",
      recipientAttributes: { id: "gid://shopify/Customer/1001" },
      note: `Goodwill: damaged item\nShopkeeper operation: ${expectedCode}`,
      expiresOn: "2026-10-04",
    });
    expect(result.status).toBe("ok");
    expect(result.spentCents).toBe(2500);
    expect(result.message).toContain(expectedCode);
    expect(result.message).toContain("Shopify is emailing the code to the customer");
  });

  it("requires the code in the reply when no customer is attached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      data: {
        giftCardCreate: {
          giftCardCode: expectedCode,
          giftCard: {
            id: "gid://shopify/GiftCard/9002",
            expiresOn: null,
            note: `Shopkeeper operation: ${expectedCode}`,
            initialValue: { amount: "25.00" },
            customer: null,
          },
          userErrors: [],
        },
      },
    })));

    const result = await createGiftCard({ amount: "25.00" }, ctx);

    expect(result.status).toBe("ok");
    expect(result.message).toContain("MUST tell the customer the code");
  });

  it("returns unknown when Shopify omits the code", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      data: {
        giftCardCreate: {
          giftCardCode: null,
          giftCard: {
            id: "gid://shopify/GiftCard/9003",
            expiresOn: null,
            note: `Shopkeeper operation: ${expectedCode}`,
            initialValue: { amount: "25.00" },
            customer: null,
          },
          userErrors: [],
        },
      },
    })));

    const result = await createGiftCard({ amount: "25.00" }, ctx);

    expect(result).toMatchObject({
      status: "unknown",
      spentCents: null,
    });
    expect(result.message).toContain("incomplete or mismatched gift card");
  });

  it.each([429, 503])("returns unknown without replaying an ambiguous HTTP %i", async (status) => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ errors: "response lost" }, status));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createGiftCard({ amount: "25.00" }, ctx);

    expect(result.status).toBe("unknown");
    expect(result.spentCents).toBeNull();
    expect(result.message).toContain(expectedCode);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns unknown after a connection loss without replaying the gift card", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError("socket closed after request write"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createGiftCard({ amount: "25.00" }, ctx);

    expect(result.status).toBe("unknown");
    expect(result.spentCents).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("treats a taken stable code as an unknown prior commit", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse({
      data: {
        giftCardCreate: {
          giftCard: null,
          giftCardCode: null,
          userErrors: [{ field: ["input", "code"], message: "Code has already been taken.", code: "TAKEN" }],
        },
      },
    })));

    const result = await createGiftCard({ amount: "25.00" }, ctx);

    expect(result.status).toBe("unknown");
    expect(result.spentCents).toBeNull();
    expect(result.message).toContain("same operation may already have committed");
  });
});

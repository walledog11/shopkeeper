import { afterEach, describe, expect, it, vi } from "vitest";
import { createGiftCard } from "./gift-cards.js";

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
          giftCardCode: "gjh3 k2m9 p4qr 8stv",
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
      customerId: "gid://shopify/Customer/1001",
      recipientAttributes: { id: "gid://shopify/Customer/1001" },
      note: "Goodwill: damaged item",
      expiresOn: "2026-10-04",
    });
    expect(result.status).toBe("ok");
    expect(result.spentCents).toBe(2500);
    expect(result.message).toContain("gjh3 k2m9 p4qr 8stv");
    expect(result.message).toContain("Shopify is emailing the code to the customer");
  });

  it("requires the code in the reply when no customer is attached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      data: {
        giftCardCreate: {
          giftCardCode: "abcd efgh ijkl mnop",
          userErrors: [],
        },
      },
    })));

    const result = await createGiftCard({ amount: "25.00" }, ctx);

    expect(result.status).toBe("ok");
    expect(result.message).toContain("MUST tell the customer the code");
  });

  it("returns an explicit error when Shopify omits the code", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      data: {
        giftCardCreate: {
          giftCardCode: null,
          userErrors: [],
        },
      },
    })));

    const result = await createGiftCard({ amount: "25.00" }, ctx);

    expect(result).toMatchObject({
      status: "error",
      spentCents: null,
      message: "Error: could not create gift card - Shopify did not return a gift card code.",
    });
  });
});

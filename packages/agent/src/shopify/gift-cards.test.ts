import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse } from "../testing/json-response.js";
import { createGiftCard } from "./gift-cards.js";
import { shopifyIdempotencyKey } from "./client.js";

const ctx = {
  shop: "test-store.myshopify.com",
  accessToken: "shpat_test",
  operationId: "execution-1:create-gift-card",
};

const expectedCode = shopifyIdempotencyKey(ctx.operationId).replaceAll("-", "").slice(0, 20);

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

    expect(result.status).toBe("policy_block");
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
            initialValue: { amount: "25.00", currencyCode: "USD" },
            customer: { id: "gid://shopify/Customer/1001" },
          },
          userErrors: [],
        },
      },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createGiftCard(
      { amount: "25.00", customer_id: "1001", reason: "damaged item", expires_in_days: 90 },
      { ...ctx, executionId: "execution-gift-card-1" },
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
    expect(result.receipt).toMatchObject({
      tool: "create_gift_card",
      target: { kind: "customer", id: "1001" },
      outcome: "succeeded",
      providerReference: "gid://shopify/GiftCard/9001",
      facts: {
        giftCardId: "gid://shopify/GiftCard/9001",
        customerId: "1001",
        amount: "25.00",
        currency: "USD",
        lastCharacters: expectedCode.slice(-4),
        expiresOn: "2026-10-04",
        notificationRequested: true,
      },
    });
    expect(result.receipt && "facts" in result.receipt && JSON.stringify(result.receipt.facts))
      .not.toContain(expectedCode);
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
            initialValue: { amount: "25.00", currencyCode: "USD" },
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
    expect(result.message).toContain("may have committed");
  });

  it.each([429, 503])("returns unknown without replaying an ambiguous HTTP %i", async (status) => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ errors: "response lost" }, status))
      .mockResolvedValueOnce(jsonResponse({ data: { giftCards: { nodes: [] } } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createGiftCard({ amount: "25.00" }, ctx);

    expect(result.status).toBe("unknown");
    expect(result.spentCents).toBeNull();
    expect(result.message).toContain(expectedCode);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns unknown after a connection loss without replaying the gift card", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError("socket closed after request write"))
      .mockResolvedValueOnce(jsonResponse({ data: { giftCards: { nodes: [] } } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createGiftCard({ amount: "25.00" }, ctx);

    expect(result.status).toBe("unknown");
    expect(result.spentCents).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("treats a taken stable code as an unknown prior commit", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        data: {
          giftCardCreate: {
            giftCard: null,
            giftCardCode: null,
            userErrors: [{ field: ["input", "code"], message: "Code has already been taken.", code: "TAKEN" }],
          },
        },
      }))
      .mockResolvedValueOnce(jsonResponse({ data: { giftCards: { nodes: [] } } })));

    const result = await createGiftCard({ amount: "25.00" }, ctx);

    expect(result.status).toBe("unknown");
    expect(result.spentCents).toBeNull();
    expect(result.message).toContain("may have committed");
  });

  it("confirms an exact gift card after an ambiguous provider response", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ errors: "response lost" }, 503))
      .mockResolvedValueOnce(jsonResponse({
        data: {
          giftCards: {
            nodes: [{
              id: "gid://shopify/GiftCard/9004",
              expiresOn: null,
              note: `Goodwill: delayed parcel\nShopkeeper operation: ${expectedCode}`,
              initialValue: { amount: "25.00", currencyCode: "USD" },
              customer: { id: "gid://shopify/Customer/1001" },
              lastCharacters: expectedCode.slice(-4),
            }],
          },
        },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createGiftCard(
      { amount: "25.00", customer_id: "1001", reason: "delayed parcel" },
      { ...ctx, executionId: "execution-gift-card-reconciled" },
    );

    expect(result).toMatchObject({
      status: "ok",
      spentCents: 2500,
      receipt: {
        outcome: "succeeded",
        providerReference: "gid://shopify/GiftCard/9004",
        facts: { amount: "25.00", currency: "USD", customerId: "1001" },
      },
    });
    expect(result.message).toContain("confirmed after an interrupted provider response");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns a typed failed receipt for a conclusive provider rejection", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      data: {
        giftCardCreate: {
          giftCard: null,
          giftCardCode: null,
          userErrors: [{ field: ["input", "initialValue"], message: "Value is unavailable.", code: "INVALID" }],
        },
      },
    })));

    const result = await createGiftCard(
      { amount: "25.00", customer_id: "1001" },
      { ...ctx, executionId: "execution-gift-card-failed" },
    );

    expect(result).toMatchObject({
      status: "error",
      spentCents: null,
      receipt: {
        tool: "create_gift_card",
        target: { kind: "customer", id: "1001" },
        outcome: "failed",
        code: "provider_rejected_gift_card",
        providerReference: null,
      },
    });
  });

  it("returns a typed rejected receipt for invalid input", async () => {
    const result = await createGiftCard(
      { amount: "0", customer_id: "1001" },
      { ...ctx, executionId: "execution-gift-card-rejected" },
    );

    expect(result).toMatchObject({
      status: "policy_block",
      spentCents: null,
      receipt: {
        outcome: "rejected",
        code: "invalid_gift_card_input",
      },
    });
  });
});

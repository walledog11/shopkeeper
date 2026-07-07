import { afterEach, describe, expect, it, vi } from "vitest";
import { issueStoreCredit } from "./store-credit.js";

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

const shopCurrencyResponse = () => jsonResponse({ data: { shop: { currencyCode: "USD" } } });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("issueStoreCredit", () => {
  it("validates the amount before calling Shopify", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await issueStoreCredit({ customer_id: "1001", amount: "-5" }, ctx);

    expect(result.status).toBe("error");
    expect(result.spentCents).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("credits the customer account in the shop currency and reports spent cents", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(shopCurrencyResponse())
      .mockResolvedValueOnce(jsonResponse({
        data: {
          storeCreditAccountCredit: {
            storeCreditAccountTransaction: {
              amount: { amount: "25.00", currencyCode: "USD" },
              account: { balance: { amount: "40.00", currencyCode: "USD" } },
            },
            userErrors: [],
          },
        },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await issueStoreCredit({ customer_id: "1001", amount: "25.00" }, ctx);

    const request = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(request.variables).toEqual({
      id: "gid://shopify/Customer/1001",
      creditInput: { creditAmount: { amount: "25.00", currencyCode: "USD" } },
    });
    expect(result.status).toBe("ok");
    expect(result.spentCents).toBe(2500);
    expect(result.message).toContain("$25.00 USD of store credit");
    expect(result.message).toContain("balance is now $40.00 USD");
  });

  it("passes an expiry date when expires_in_days is set", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-06T12:00:00.000Z"));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(shopCurrencyResponse())
      .mockResolvedValueOnce(jsonResponse({
        data: {
          storeCreditAccountCredit: {
            storeCreditAccountTransaction: { amount: { amount: "10.00", currencyCode: "USD" } },
            userErrors: [],
          },
        },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await issueStoreCredit({ customer_id: "1001", amount: "10.00", expires_in_days: 30 }, ctx);
    vi.useRealTimers();

    const request = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(request.variables.creditInput.expiresAt).toBe("2026-08-05");
    expect(result.message).toContain("expires in 30 day(s)");
  });

  it("suggests the gift card fallback when Shopify rejects the credit", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(shopCurrencyResponse())
      .mockResolvedValueOnce(jsonResponse({
        data: {
          storeCreditAccountCredit: {
            storeCreditAccountTransaction: null,
            userErrors: [{ field: ["id"], message: "Store credit is not enabled." }],
          },
        },
      }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await issueStoreCredit({ customer_id: "1001", amount: "25.00" }, ctx);

    expect(result.status).toBe("error");
    expect(result.spentCents).toBeNull();
    expect(result.message).toContain("Store credit is not enabled.");
    expect(result.message).toContain("use create_gift_card");
  });
});

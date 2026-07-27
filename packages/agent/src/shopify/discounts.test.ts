import { afterEach, describe, expect, it, vi } from "vitest";
import { discountCodeForOperation, issueDiscount } from "./discounts.js";

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

describe("issueDiscount edge cases", () => {
  it("validates expiry days before calling Shopify", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await issueDiscount({ percentage: 10, expires_in_days: 0 }, ctx);

    expect(result).toEqual({
      status: "error",
      message: "Error: expires_in_days must be a positive integer.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sets an expiry and falls back to the generated code when Shopify omits it", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-27T12:00:00.000Z"));
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: {
        discountCodeBasicCreate: {
          codeDiscountNode: {
            codeDiscount: { codes: { nodes: [] }, endsAt: "2026-06-30T12:00:00.000Z" },
          },
          userErrors: [],
        },
      },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await issueDiscount({ percentage: 15, expires_in_days: 3 }, ctx);
    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string);

    expect(request.variables.basicCodeDiscount).toMatchObject({
      title: "Goodwill 15% off",
      endsAt: "2026-06-30T12:00:00.000Z",
    });
    expect(request.variables.basicCodeDiscount.code).toMatch(/^THANKS15-[A-F0-9]{8}$/);
    expect(result.message).toContain(request.variables.basicCodeDiscount.code);
    expect(result.message).toContain("expires in 3 day(s)");
  });

  it("returns an explicit error when Shopify omits the discount node", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      data: {
        discountCodeBasicCreate: {
          codeDiscountNode: null,
          userErrors: [],
        },
      },
    })));

    await expect(issueDiscount({ percentage: 20 }, ctx)).resolves.toEqual({
      status: "error",
      message: "Error: could not create discount code - Shopify did not return a discount.",
    });
  });

  it("reuses a deterministic operation code and confirms an earlier attempt", async () => {
    const operationId = "execution-1:discount";
    const code = discountCodeForOperation(10, operationId);
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: {
        codeDiscountNodeByCode: {
          id: "gid://shopify/DiscountCodeNode/1",
          codeDiscount: { codes: { nodes: [{ code }] } },
        },
      },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await issueDiscount({ percentage: 10 }, { ...ctx, operationId });

    expect(result).toMatchObject({ status: "ok" });
    expect(result.message).toContain(code);
    expect(result.message).toContain("earlier attempt");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports an ambiguous create failure as unknown", async () => {
    const operationId = "execution-2:discount";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        data: { codeDiscountNodeByCode: null },
      }))
      .mockRejectedValueOnce(new TypeError("connection reset"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await issueDiscount({ percentage: 10 }, { ...ctx, operationId });

    expect(result.status).toBe("unknown");
    expect(result.message).toContain(discountCodeForOperation(10, operationId));
    expect(result.message).toContain("Do not issue another discount");
  });
});

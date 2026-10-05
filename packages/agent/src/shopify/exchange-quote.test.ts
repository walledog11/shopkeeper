import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonResponse } from "../testing/json-response.js";
import { getExchangeQuote } from "./exchange-quote.js";

const ctx = { shop: "test-store.myshopify.com", accessToken: "shpat_test" };
const input = { order_id: "2001", variant_id: "101", exchange_variant_id: "102" };
const returnedId = "gid://shopify/FulfillmentLineItem/111";
const replacementId = "gid://shopify/ProductVariant/102";
const money = (customer: string, shop: string) => ({
  presentmentMoney: { amount: customer, currencyCode: "CAD" },
  shopMoney: { amount: shop, currencyCode: "USD" },
});

function calculation() {
  return {
    returnLineItems: [{
      fulfillmentLineItem: { id: returnedId }, quantity: 1,
      subtotalSet: money("80.00", "60.00"), totalTaxSet: money("10.00", "6.00"),
      restockingFee: { amountSet: money("3.00", "2.25") },
    }],
    exchangeLineItems: [{
      variant: { id: replacementId }, quantity: 1,
      subtotalSet: money("100.00", "75.00"), totalTaxSet: money("12.00", "7.50"),
    }],
    returnShippingFee: { amountSet: money("5.00", "3.75") },
  };
}

function respond(quote: unknown) {
  vi.stubGlobal("fetch", vi.fn()
    .mockResolvedValueOnce(jsonResponse({ data: {
      order: { id: "gid://shopify/Order/2001" },
      returnableFulfillments: { edges: [{ node: {
        returnableFulfillmentLineItems: { edges: [{ node: {
          quantity: 1, fulfillmentLineItem: {
            id: returnedId, lineItem: { name: "Boots", variant: { id: "gid://shopify/ProductVariant/101" } },
          },
        } }] },
      } }] },
    } }))
    .mockResolvedValueOnce(jsonResponse({ data: { returnCalculate: quote } })));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("getExchangeQuote", () => {
  it("uses discounted order amounts, taxes and fees in each provider currency without moving money", async () => {
    respond(calculation());
    const result = await getExchangeQuote(input, ctx);

    expect(result.status).toBe("ok");
    expect(JSON.parse(result.message)).toMatchObject({
      source: "Shopify returnCalculate", orderId: "2001", variantId: "101", replacementVariantId: "102", quantity: 1,
      presentmentMoney: {
        returned: { amount: "90.00", currencyCode: "CAD" },
        replacement: { amount: "112.00", currencyCode: "CAD" },
        fees: { amount: "8.00", currencyCode: "CAD" },
        difference: { direction: "additional_payment", amount: "30.00", currency: "CAD" },
      },
      shopMoney: { difference: { direction: "additional_payment", amount: "22.50", currency: "USD" } },
      finalBalanceEstablished: false, financialTransferPerformed: false,
    });
    expect(result.receipt).toBeUndefined();
    const requests = vi.mocked(fetch).mock.calls.map(([, init]) => JSON.parse(init!.body as string));
    expect(requests.every(request => /^query\b/.test(request.query))).toBe(true);
    expect(requests[1].variables.input).toEqual({
      orderId: "gid://shopify/Order/2001",
      returnLineItems: [{ fulfillmentLineItemId: returnedId, quantity: 1 }],
      exchangeLineItems: [{ variantId: replacementId, quantity: 1 }],
    });
  });

  it("keeps three-decimal amounts exact and describes a negative difference as a refund estimate", async () => {
    const quote = calculation();
    for (const bag of [quote.returnLineItems[0].subtotalSet, quote.returnLineItems[0].totalTaxSet,
      quote.exchangeLineItems[0].subtotalSet, quote.exchangeLineItems[0].totalTaxSet,
      quote.returnLineItems[0].restockingFee.amountSet, quote.returnShippingFee.amountSet]) {
      bag.presentmentMoney = { amount: "0.000", currencyCode: "KWD" };
    }
    quote.returnLineItems[0].subtotalSet.presentmentMoney.amount = "0.222";
    quote.exchangeLineItems[0].subtotalSet.presentmentMoney.amount = "0.111";
    respond(quote);

    const result = await getExchangeQuote(input, ctx);

    expect(result.status).toBe("ok");
    expect(JSON.parse(result.message).presentmentMoney.difference).toEqual({
      direction: "refund", amount: "0.111", currency: "KWD",
    });
  });

  it.each(["wrong_item", "wrong_quantity", "missing_money", "different_currency", "malformed_money", "missing_fee"])(
    "withholds the estimate for %s rather than inventing a zero balance",
    async defect => {
      const quote = calculation();
      if (defect === "wrong_item") quote.exchangeLineItems[0].variant.id = "gid://shopify/ProductVariant/999";
      if (defect === "wrong_quantity") quote.returnLineItems[0].quantity = 2;
      if (defect === "different_currency") quote.exchangeLineItems[0].totalTaxSet.presentmentMoney.currencyCode = "EUR";
      if (defect === "malformed_money") quote.exchangeLineItems[0].totalTaxSet.presentmentMoney.amount = "NaN";
      if (defect === "missing_money") Reflect.deleteProperty(quote.returnLineItems[0], "subtotalSet");
      if (defect === "missing_fee") Reflect.deleteProperty(quote, "returnShippingFee");
      respond(quote);

      const result = await getExchangeQuote(input, ctx);

      expect(result.status).toBe("error");
      expect(result.receipt).toBeUndefined();
    },
  );

  it("refuses quoting more units than can be returned", async () => {
    respond(calculation());

    const result = await getExchangeQuote({ ...input, quantity: 2 }, ctx);

    expect(result.status).toBe("policy_block");
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });
});

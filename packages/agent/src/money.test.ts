import { describe, expect, it } from "vitest";
import {
  canonicalAmount,
  formatMoney,
  makeMoney,
  moneyCents,
  moneyFromCents,
  orderSettlementCurrency,
  orderSettlementMoney,
  orderShopCurrency,
  orderShopMoney,
  withinShopLimit,
} from "./money.js";

// The live shape that produced the production block: a USD shop with a customer
// charged in CAD. Every helper here exists because some caller read one of these
// two figures and attached the other one's currency to it.
const internationalOrder = {
  currency: "USD",
  presentment_currency: "CAD",
  current_total_price: "43.48",
  current_total_price_set: {
    shop_money: { amount: "43.48", currency_code: "USD" },
    presentment_money: { amount: "59.90", currency_code: "CAD" },
  },
};

const singleCurrencyOrder = { currency: "USD", current_total_price: "20.00" };

describe("order monies", () => {
  it("reads the two sides of an international order apart", () => {
    expect(orderSettlementMoney(internationalOrder)).toEqual({ amount: "59.90", currency: "CAD" });
    expect(orderShopMoney(internationalOrder)).toEqual({ amount: "43.48", currency: "USD" });
    expect(orderSettlementCurrency(internationalOrder)).toBe("CAD");
    expect(orderShopCurrency(internationalOrder)).toBe("USD");
  });

  it("reads one money twice on a single-currency order", () => {
    expect(orderSettlementMoney(singleCurrencyOrder)).toEqual({ amount: "20.00", currency: "USD" });
    expect(orderShopMoney(singleCurrencyOrder)).toEqual({ amount: "20.00", currency: "USD" });
  });

  // A currency is knowable from an order that carries no total; requiring both
  // made an order without a price unrefundable.
  it("resolves a currency without an amount", () => {
    expect(orderSettlementCurrency({ currency: "USD" })).toBe("USD");
    expect(orderShopCurrency({ currency: "USD" })).toBe("USD");
    expect(orderShopMoney({ currency: "USD" })).toBeNull();
  });
});

describe("withinShopLimit", () => {
  const fifty = 50;

  it("judges an amount in the currency the limit was set in", () => {
    expect(withinShopLimit({ amount: "43.48", currency: "USD" }, "USD", fifty)).toBe(true);
    expect(withinShopLimit({ amount: "50.00", currency: "USD" }, "USD", fifty)).toBe(true);
    expect(withinShopLimit({ amount: "50.01", currency: "USD" }, "USD", fifty)).toBe(false);
  });

  // The production failure in one line: 59.90 CAD is not "over 50" just because
  // 59.90 > 50. It is an amount in a currency this limit was never set in.
  it("refuses to judge an amount in another currency", () => {
    expect(withinShopLimit({ amount: "59.90", currency: "CAD" }, "USD", fifty)).toBeNull();
    expect(withinShopLimit({ amount: "59.90", currency: "CAD" }, null, fifty)).toBeNull();
  });

  it("permits everything when no limit is set", () => {
    expect(withinShopLimit({ amount: "9999.00", currency: "CAD" }, "USD", null)).toBe(true);
    expect(withinShopLimit({ amount: "9999.00", currency: "CAD" }, "USD", 0)).toBe(true);
  });
});

describe("money values", () => {
  it.each([
    ["19.9", "19.90"],
    ["19", "19.00"],
    ["19.99", "19.99"],
  ])("canonicalizes %s", (input, expected) => {
    expect(canonicalAmount(input)).toBe(expected);
  });

  it.each(["", "abc", "-5.00", "19.999", null, undefined])("rejects %s", (input) => {
    expect(canonicalAmount(input as string)).toBeNull();
  });

  it("requires both halves to make a money", () => {
    expect(makeMoney("19.99", "usd")).toEqual({ amount: "19.99", currency: "USD" });
    expect(makeMoney("19.99", null)).toBeNull();
    expect(makeMoney(null, "USD")).toBeNull();
  });

  it("round-trips through cents", () => {
    expect(moneyCents({ amount: "59.90", currency: "CAD" })).toBe(5990);
    expect(moneyFromCents(5990, "cad")).toEqual({ amount: "59.90", currency: "CAD" });
  });

  // A bare symbol on a non-USD amount is the ambiguity this module removes.
  it("names the currency whenever it is not USD", () => {
    expect(formatMoney({ amount: "20.00", currency: "USD" })).toBe("$20.00");
    expect(formatMoney({ amount: "59.90", currency: "CAD" })).toBe("59.90 CAD");
    expect(formatMoney({ amount: "18.50", currency: "EUR" })).toBe("18.50 EUR");
  });
});

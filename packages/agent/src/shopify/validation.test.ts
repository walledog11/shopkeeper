import { describe, expect, it } from "vitest";
import { centsToMoney, moneyToCents } from "./validation.js";

describe("moneyToCents", () => {
  it("reads whole and fractional amounts with integer math", () => {
    expect(moneyToCents("0.00")).toBe(0);
    expect(moneyToCents("19.99")).toBe(1999);
    expect(moneyToCents("8.20")).toBe(820);
    expect(moneyToCents("100")).toBe(10000);
    expect(moneyToCents("12345678.99")).toBe(1234567899);
  });

  it("pads a single decimal place rather than reading it as cents", () => {
    expect(moneyToCents("5.5")).toBe(550);
  });

  it("round-trips through centsToMoney", () => {
    for (const amount of ["0.01", "19.99", "8.20", "1250.00"]) {
      expect(centsToMoney(moneyToCents(amount))).toBe(amount);
    }
  });

  // The value-at-risk path reads prices out of optional GraphQL fields, so a
  // null reaches this helper on a variant Shopify returned without one. NaN
  // there would pass every blast-radius comparison instead of failing it.
  it("treats a missing or unparseable amount as zero, never NaN", () => {
    for (const value of [null, undefined, "", "abc", "$12.00"]) {
      expect(moneyToCents(value)).toBe(0);
    }
  });
});

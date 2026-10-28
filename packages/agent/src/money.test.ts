import { describe, expect, it } from "vitest";
import { formatMoney, normalizeCurrencyCode } from "./money.js";

describe("money", () => {
  it("normalizes ISO currency codes with a safe fallback", () => {
    expect(normalizeCurrencyCode("cad")).toBe("CAD");
    expect(normalizeCurrencyCode(null)).toBe("USD");
    expect(normalizeCurrencyCode("dollars", "gbp")).toBe("GBP");
  });

  it("formats in the currency's own decimals", () => {
    expect(formatMoney("12.50", "USD")).toBe("$12.50");
    expect(formatMoney("12.50", "CAD")).toBe("12.50 CAD");
    expect(formatMoney("1200", "JPY", { exact: true })).toBe("1,200 JPY");
    expect(formatMoney(1234, "USD")).toBe("$1,234");
    expect(formatMoney("20", "USD", { exact: true })).toBe("$20.00");
  });
});

import { describe, expect, it } from "vitest"
import { formatCurrency, normalizeCurrencyCode } from "./currency"

describe("currency formatting", () => {
  it("normalizes ISO currency codes with a safe fallback", () => {
    expect(normalizeCurrencyCode("cad")).toBe("CAD")
    expect(normalizeCurrencyCode(null)).toBe("USD")
    expect(normalizeCurrencyCode("dollars", "gbp")).toBe("GBP")
  })

  it("formats the amount in the order currency", () => {
    expect(formatCurrency("12.50", "USD", "en-US")).toBe("$12.50")
    expect(formatCurrency("12.50", "CAD", "en-US")).toBe("CA$12.50")
    expect(formatCurrency("1200", "JPY", "en-US")).toBe("¥1,200")
  })
})

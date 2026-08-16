import { describe, expect, it } from "vitest"
import { getConciergeFillerPhrases } from "./concierge-filler-phrases"

describe("getConciergeFillerPhrases", () => {
  it("uses ticket-summary phrases for summarize open tickets", () => {
    const phrases = getConciergeFillerPhrases("summarize all my open tickets")
    expect(phrases[0]).toBe("Summarizing open tickets…")
    expect(phrases).toContain("Reading your inbox…")
  })

  it("uses order phrases for order status questions", () => {
    const phrases = getConciergeFillerPhrases("what's the status on ayumu order")
    expect(phrases[0]).toBe("Looking up the order…")
    expect(phrases).toContain("Checking Shopify…")
  })

  it("uses draft phrases for reply requests", () => {
    const phrases = getConciergeFillerPhrases("draft a reply to Sarah about shipping")
    expect(phrases[0]).toBe("Drafting a reply…")
  })

  it("uses ticket phrases for inbox lookups without summarize", () => {
    const phrases = getConciergeFillerPhrases("anything urgent in tickets?")
    expect(phrases[0]).toBe("Looking up tickets…")
  })

  it("uses knowledge phrases for policy questions", () => {
    const phrases = getConciergeFillerPhrases("what's our return policy for international shoppers?")
    expect(phrases[0]).toBe("Searching knowledge base…")
  })

  it("uses reasoning fallback for advice-style prompts", () => {
    const phrases = getConciergeFillerPhrases("should I offer a discount to this customer?")
    expect(phrases[0]).toBe("Thinking it through…")
  })

  it("uses question fallback for unmatched questions", () => {
    const phrases = getConciergeFillerPhrases("why do customers keep asking about gift wrapping?")
    expect(phrases[0]).toBe("Thinking through that…")
  })

  it("uses generic fallback for unmatched statements", () => {
    const phrases = getConciergeFillerPhrases("international returns are tricky")
    expect(phrases[0]).toBe("Working on it…")
  })
})

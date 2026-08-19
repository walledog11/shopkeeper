import { describe, expect, it } from "vitest"
import { customerDisplayLabel, realCustomerName, timeAgoCard, timeAgoShort } from "./customer-display"

describe("customer display helpers", () => {
  it("returns a real customer name when one exists", () => {
    expect(realCustomerName({ name: "Alex Rivera", platformId: "alex@store.com" })).toBe("Alex Rivera")
    expect(customerDisplayLabel({ name: "Alex Rivera", platformId: "alex@store.com" })).toBe("Alex Rivera")
  })

  it("falls back to platform id for unknown senders", () => {
    expect(realCustomerName({ name: null, platformId: "promo@sketchy.biz" })).toBeNull()
    expect(customerDisplayLabel({ name: null, platformId: "promo@sketchy.biz" })).toBe("promo@sketchy.biz")
  })

  it("does not dress a storefront session id up as a name", () => {
    const guest = { name: null, platformId: "shopify_chat:e36cd568-3053-4448-8e62-6cb1f0a9d2e7" }
    expect(customerDisplayLabel(guest)).toBe("Storefront visitor")
    expect(realCustomerName(guest)).toBeNull()
  })

  it("still prefers a real name once the guest identifies themselves", () => {
    const named = { name: "Sam Ortiz", platformId: "shopify_chat:e36cd568-3053-4448-8e62-6cb1f0a9d2e7" }
    expect(customerDisplayLabel(named)).toBe("Sam Ortiz")
    expect(realCustomerName(named)).toBe("Sam Ortiz")
  })

  it("formats short relative times", () => {
    const now = new Date("2026-06-14T12:00:00.000Z")
    expect(timeAgoShort(new Date("2026-06-14T11:59:30.000Z"), now)).toBe("just now")
    expect(timeAgoShort(new Date("2026-06-14T11:30:00.000Z"), now)).toBe("30m ago")
    expect(timeAgoShort(new Date("2026-06-13T12:00:00.000Z"), now)).toBe("1d ago")
  })

  it("formats card-friendly relative times and dates", () => {
    const now = new Date("2026-06-14T12:00:00.000Z")
    expect(timeAgoCard(new Date("2026-06-14T11:59:30.000Z"), now)).toBe("Just now")
    expect(timeAgoCard(new Date("2026-06-14T11:30:00.000Z"), now)).toBe("30 min ago")
    expect(timeAgoCard(new Date("2026-06-13T12:00:00.000Z"), now)).toBe("Yesterday")
    expect(timeAgoCard(new Date("2026-05-14T12:00:00.000Z"), now)).toBe("May 14")
  })
})

import { describe, expect, it } from "vitest"
import { customerDisplayLabel, realCustomerName, timeAgoShort } from "./customer-display"

describe("customer display helpers", () => {
  it("returns a real customer name when one exists", () => {
    expect(realCustomerName({ name: "Alex Rivera", platformId: "alex@store.com" })).toBe("Alex Rivera")
    expect(customerDisplayLabel({ name: "Alex Rivera", platformId: "alex@store.com" })).toBe("Alex Rivera")
  })

  it("falls back to platform id for unknown senders", () => {
    expect(realCustomerName({ name: null, platformId: "promo@sketchy.biz" })).toBeNull()
    expect(customerDisplayLabel({ name: null, platformId: "promo@sketchy.biz" })).toBe("promo@sketchy.biz")
  })

  it("formats short relative times", () => {
    const now = new Date("2026-06-14T12:00:00.000Z")
    expect(timeAgoShort(new Date("2026-06-14T11:59:30.000Z"), now)).toBe("just now")
    expect(timeAgoShort(new Date("2026-06-14T11:30:00.000Z"), now)).toBe("30m ago")
    expect(timeAgoShort(new Date("2026-06-13T12:00:00.000Z"), now)).toBe("1d ago")
  })
})

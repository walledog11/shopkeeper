import { describe, expect, it } from "vitest"
import { planRecipientDisplay } from "./plan-recipient-display"

describe("planRecipientDisplay", () => {
  it("uses first name in header and draft when a display name is available", () => {
    expect(planRecipientDisplay("Maya Chen")).toEqual({
      headerTo: "Maya",
      draftTo: "Maya",
    })
  })

  it("omits header recipient and shows email once in the draft line", () => {
    const result = planRecipientDisplay("muhammeddigital003@gmail.com")
    expect(result.headerTo).toBeNull()
    expect(result.draftTo).toBe("muhammeddigital003@gmail.com")
  })

  it("truncates very long email addresses in the draft line", () => {
    const email = "verylonglocalpartname@example.com"
    const result = planRecipientDisplay(email)
    expect(result.headerTo).toBeNull()
    expect(result.draftTo.length).toBeLessThan(email.length)
    expect(result.draftTo).toContain("@example.com")
  })

  it("falls back to Customer when identity is unknown", () => {
    expect(planRecipientDisplay(null)).toEqual({
      headerTo: null,
      draftTo: "Customer",
    })
  })
})

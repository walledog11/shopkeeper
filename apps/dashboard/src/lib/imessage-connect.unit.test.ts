import { describe, expect, it } from "vitest"
import { buildSmsDeepLink, formatHandleLabel } from "./imessage-connect"

describe("buildSmsDeepLink", () => {
  it("builds an sms deep link with encoded body", () => {
    expect(buildSmsDeepLink("+1 (628) 264-7754", "abc123")).toBe(
      "sms:+16282647754&body=abc123",
    )
  })
})

describe("formatHandleLabel", () => {
  it("pretty-prints US E.164 numbers", () => {
    expect(formatHandleLabel("+19096622741")).toBe("+1 (909) 662-2741")
  })

  it("leaves non-phone labels unchanged", () => {
    expect(formatHandleLabel("Alex Merchant")).toBe("Alex Merchant")
  })
})

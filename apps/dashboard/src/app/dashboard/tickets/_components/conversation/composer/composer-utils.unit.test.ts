import { describe, expect, it } from "vitest"
import {
  buildComposerPlaceholder,
  isInstagramReplyWindowExpired,
} from "./composer-utils"

describe("isInstagramReplyWindowExpired", () => {
  it("expires Instagram replies after 24 hours outside notes and agent mode", () => {
    const nowMs = new Date("2026-06-05T12:00:00.000Z").getTime()

    expect(isInstagramReplyWindowExpired({
      channelType: "ig_dm",
      isAgentMode: false,
      isNoteTab: false,
      lastCustomerMessageAt: "2026-06-04T11:59:00.000Z",
      nowMs,
    })).toBe(true)
    expect(isInstagramReplyWindowExpired({
      channelType: "ig_dm",
      isAgentMode: false,
      isNoteTab: true,
      lastCustomerMessageAt: "2026-06-04T11:59:00.000Z",
      nowMs,
    })).toBe(false)
  })
})

describe("buildComposerPlaceholder", () => {
  it("keeps desktop shortcut hints out of mobile placeholders", () => {
    expect(buildComposerPlaceholder({
      agentName: "Shopkeeper",
      customerName: "Maya",
      isMobile: false,
      isNoteTab: false,
    })).toContain("⌘↵ to send")
    expect(buildComposerPlaceholder({
      agentName: "Shopkeeper",
      customerName: "Maya",
      isMobile: true,
      isNoteTab: false,
    })).not.toContain("⌘↵ to send")
  })
})

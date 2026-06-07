import { describe, expect, it } from "vitest"
import type { CannedResponse } from "@/types"
import {
  buildCannedResponseBody,
  buildComposerPlaceholder,
  filterCannedResponses,
  insertCannedResponseValue,
  isInstagramReplyWindowExpired,
} from "./composer-utils"

const canned = (overrides: Partial<CannedResponse>): CannedResponse => ({
  id: "response-1",
  organizationId: "org-1",
  title: "Shipping update",
  body: "Hi {{customer_name}}, order {{order_number}} from {{store_name}} is on the way.",
  tags: [],
  channels: [],
  useCount: 0,
  lastUsedAt: null,
  createdAt: "2026-06-05T12:00:00.000Z",
  updatedAt: "2026-06-05T12:00:00.000Z",
  ...overrides,
})

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

describe("filterCannedResponses", () => {
  it("matches query text and channel restrictions", () => {
    const responses = [
      canned({ id: "email", title: "Shipping email", channels: ["email"] }),
      canned({ id: "ig", title: "Shipping IG", channels: ["ig_dm"] }),
      canned({ id: "any", title: "General", body: "shipping details", channels: [] }),
    ]

    expect(filterCannedResponses(responses, "ship", "email").map(r => r.id)).toEqual(["email", "any"])
    expect(filterCannedResponses(responses, null, "email")).toEqual([])
  })
})

describe("canned response insertion", () => {
  it("fills supported template variables", () => {
    expect(buildCannedResponseBody(canned({}), {
      customerFirstName: "Maya",
      orderName: "#1001",
      storeName: "Acme",
    })).toBe("Hi Maya, order #1001 from Acme is on the way.")
  })

  it("replaces slash queries or appends with spacing", () => {
    expect(insertCannedResponseValue("Please /ship", "Body")).toBe("Please Body")
    expect(insertCannedResponseValue("/ship", "Body")).toBe("Body")
    expect(insertCannedResponseValue("Existing", "Body")).toBe("Existing Body")
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

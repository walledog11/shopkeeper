import { describe, expect, it } from "vitest"
import { AGENT_PLAN_CACHE_VERSION } from "@shopkeeper/agent/plan-cache-shape"
import {
  buildTicketListPresentation,
  compareTicketTriageTier,
} from "./ticket-list-presentation"
import type { AgentPlan, Thread } from "@/types"

const customerMessageId = "msg-customer-1"
const now = new Date("2026-06-14T12:00:00.000Z")

function cacheRecord(plan: AgentPlan, messageId = customerMessageId) {
  return {
    version: AGENT_PLAN_CACHE_VERSION,
    instruction: plan.instruction,
    lastCustomerMessageId: messageId,
    settingsFingerprint: "test",
    plan,
  }
}

function quickReplyPlan(): AgentPlan {
  return {
    instruction: "Reply with shipping policy",
    rawToolCalls: [{ id: "reply-1", name: "send_reply", input: { text: "We ship in 2-3 days." } }],
    steps: [{
      id: "reply-1",
      tool: "send_reply",
      label: "Reply",
      description: "Send shipping policy reply",
      category: "communication",
      enabled: true,
    }],
  }
}

function refundPlan(): AgentPlan {
  return {
    instruction: "Issue refund",
    rawToolCalls: [
      { id: "refund-1", name: "create_refund", input: { amount: "24.00" } },
      { id: "reply-1", name: "send_reply", input: { text: "Refund processed." } },
    ],
    steps: [
      {
        id: "refund-1",
        tool: "create_refund",
        label: "Refund",
        description: "Refund $24",
        category: "action",
        enabled: true,
      },
      {
        id: "reply-1",
        tool: "send_reply",
        label: "Reply",
        description: "Confirm refund",
        category: "communication",
        enabled: true,
      },
    ],
  }
}

function baseThread(overrides: Partial<Thread> = {}): BuildTicketListPresentationThread {
  return {
    channelType: "email",
    status: "open",
    lastMessageAt: "2026-06-14T11:30:00.000Z",
    aiSummary: "Customer asking about shipping times",
    subject: "Shipping question",
    tag: "Shipping",
    cachedPlan: cacheRecord(quickReplyPlan()),
    cachedPlanMessageId: customerMessageId,
    filterStatus: "genuine",
    shopifyCustomerId: "shopify-1",
    customer: {
      id: "cust-1",
      organizationId: "org-1",
      name: "Alex Rivera",
      platformId: "alex@store.com",
      profilePicUrl: null,
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    messages: [{
      id: customerMessageId,
      threadId: "thread-1",
      senderType: "customer",
      contentText: "How long does shipping take?",
      mediaUrl: null,
      attachments: [],
      sentAt: "2026-06-14T11:30:00.000Z",
    }],
    ...overrides,
  }
}

type BuildTicketListPresentationThread = Parameters<typeof buildTicketListPresentation>[0]["thread"]

describe("buildTicketListPresentation", () => {
  it("assigns approve tier for quick_reply with a clean sender", () => {
    const presentation = buildTicketListPresentation({
      thread: baseThread(),
      orgSettings: { autonomyTier: "guarded" },
      now,
    })

    expect(presentation.tier).toBe("approve")
    expect(presentation.primaryStatus).toEqual({ label: "Ready to send", tone: "send" })
    expect(presentation.action).toMatchObject({
      handler: "quick-approve",
      variant: "send",
    })
  })

  it("downgrades questionable + quick_reply to review and blocks send", () => {
    const presentation = buildTicketListPresentation({
      thread: baseThread({ filterStatus: "questionable", filterReason: "Unknown domain" }),
      orgSettings: { autonomyTier: "guarded" },
      now,
    })

    expect(presentation.tier).toBe("review")
    expect(presentation.primaryStatus).toEqual({ label: "Review sender", tone: "caution" })
    expect(presentation.action?.handler).not.toBe("quick-approve")
    expect(presentation.action).toMatchObject({
      handler: "focus-plan",
      variant: "caution",
    })
  })

  it("assigns review tier with caution status for consequential refund plans", () => {
    const presentation = buildTicketListPresentation({
      thread: baseThread({
        cachedPlan: cacheRecord(refundPlan()),
        aiSummary: "Customer wants a refund",
      }),
      orgSettings: { autonomyTier: "guarded", maxRefundAmount: 100 },
      now,
    })

    expect(presentation.tier).toBe("review")
    expect(presentation.primaryStatus.tone).toBe("caution")
    expect(presentation.action).toMatchObject({
      handler: "focus-plan",
      variant: "caution",
    })
  })

  it("assigns waiting tier when the customer is awaiting a reply and no plan exists", () => {
    const presentation = buildTicketListPresentation({
      thread: baseThread({
        cachedPlan: null,
        cachedPlanMessageId: null,
        aiSummary: null,
      }),
      now,
    })

    expect(presentation.tier).toBe("waiting")
    expect(presentation.action).toMatchObject({
      handler: "draft-reply",
    })
  })

  it("assigns noise tier for questionable senders without a plan", () => {
    const presentation = buildTicketListPresentation({
      thread: baseThread({
        filterStatus: "questionable",
        cachedPlan: null,
        cachedPlanMessageId: null,
        aiSummary: null,
      }),
      now,
    })

    expect(presentation.tier).toBe("noise")
    expect(presentation.primaryStatus).toEqual({ label: "Review sender", tone: "caution" })
    expect(presentation.action).toBeNull()
  })

  it("hides subject on mobile queue views", () => {
    const forMe = buildTicketListPresentation({
      thread: baseThread(),
      listView: "for_me",
      isMobile: true,
      now,
    })
    const allOpen = buildTicketListPresentation({
      thread: baseThread(),
      listView: "all_open",
      isMobile: true,
      now,
    })
    const desktop = buildTicketListPresentation({
      thread: baseThread(),
      listView: "for_me",
      isMobile: false,
      now,
    })

    expect(forMe.showSubject).toBe(false)
    expect(allOpen.showSubject).toBe(false)
    expect(desktop.showSubject).toBe(true)
  })

  it("uses customer display label and channel metadata", () => {
    const presentation = buildTicketListPresentation({
      thread: baseThread({
        customer: {
          id: "cust-2",
          organizationId: "org-1",
          name: null,
          platformId: "promo@sketchy.biz",
          profilePicUrl: null,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      }),
      now,
    })

    expect(presentation.customerLabel).toBe("promo@sketchy.biz")
    expect(presentation.channelName).toBe("Email")
    expect(presentation.timeAgo).toBe("30m ago")
  })
})

describe("compareTicketTriageTier", () => {
  it("orders tiers for for_me sorting", () => {
    expect(compareTicketTriageTier("approve", "review")).toBeLessThan(0)
    expect(compareTicketTriageTier("review", "waiting")).toBeLessThan(0)
    expect(compareTicketTriageTier("waiting", "noise")).toBeLessThan(0)
    expect(compareTicketTriageTier("noise", "closed")).toBeLessThan(0)
  })
})

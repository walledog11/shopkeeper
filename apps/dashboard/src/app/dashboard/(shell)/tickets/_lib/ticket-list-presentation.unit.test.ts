import { describe, expect, it } from "vitest"
import { AGENT_PLAN_CACHE_VERSION } from "@shopkeeper/agent/plan-cache-shape"
import {
  buildTicketListPresentation,
  compareTicketTriageTier,
} from "./ticket-list-presentation"
import { buildTicketBriefSummary } from "./ticket-brief-summary"
import type { AgentPlan, Thread, Ticket } from "@/types"

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

function warningPlan(): AgentPlan {
  return {
    ...quickReplyPlan(),
    warnings: ["Manual policy review required"],
  }
}

function askOperatorPlan(): AgentPlan {
  return {
    instruction: "Ask merchant whether this is allowed",
    rawToolCalls: [{
      id: "ask-1",
      name: "ask_operator",
      input: { question: "Do we ship framed prints internationally?" },
    }],
    steps: [{
      id: "ask-1",
      tool: "ask_operator",
      label: "Ask merchant",
      description: "Ask whether framed prints ship internationally",
      category: "internal",
      enabled: true,
    }],
  }
}

function baseThread(overrides: Partial<Thread> = {}): BuildTicketListPresentationThread {
  return {
    channelType: "email",
    status: "open",
    lastMessageAt: "2026-06-14T11:30:00.000Z",
    aiTitle: null,
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
  it("prefers the AI title for card headlines", () => {
    const presentation = buildTicketListPresentation({
      thread: baseThread({
        aiTitle: "Shipping Timeline Question",
        aiSummary: "Customer asking about shipping times",
      }),
      orgSettings: { autonomyTier: "guarded" },
      now,
    })

    expect(presentation.headline).toBe("Shipping Timeline Question")
    expect(presentation.subline).toBe("We ship in 2-3 days.")
  })

  it("assigns ready tier for quick_reply with a clean sender", () => {
    const presentation = buildTicketListPresentation({
      thread: baseThread(),
      orgSettings: { autonomyTier: "guarded" },
      now,
    })

    expect(presentation.tier).toBe("ready")
    expect(presentation.primaryStatus).toEqual({ label: "Ready to send", tone: "send" })
    expect(presentation.action).toMatchObject({
      handler: "quick-approve",
      variant: "send",
    })
    expect(presentation.subline).toBe("We ship in 2-3 days.")
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
      variant: "draft",
    })
  })

  it("assigns answer tier for plans that need merchant input", () => {
    const presentation = buildTicketListPresentation({
      thread: baseThread({
        cachedPlan: cacheRecord(askOperatorPlan()),
        aiSummary: "Customer asks whether framed prints ship internationally",
      }),
      orgSettings: { autonomyTier: "guarded" },
      now,
    })

    expect(presentation.tier).toBe("answer")
    expect(presentation.primaryStatus).toEqual({ label: "Answer needed", tone: "caution" })
  })

  it("keeps questionable merchant-input plans in the answer tier", () => {
    const presentation = buildTicketListPresentation({
      thread: baseThread({
        filterStatus: "questionable",
        cachedPlan: cacheRecord(askOperatorPlan()),
        aiSummary: "Customer asks whether framed prints ship internationally",
      }),
      orgSettings: { autonomyTier: "guarded" },
      now,
    })

    expect(presentation.tier).toBe("answer")
    expect(presentation.primaryStatus).toEqual({ label: "Answer needed", tone: "caution" })
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

  it("assigns review tier for warning-blocked reply plans", () => {
    const presentation = buildTicketListPresentation({
      thread: baseThread({
        cachedPlan: cacheRecord(warningPlan()),
        aiSummary: "Customer asks about a policy exception",
      }),
      orgSettings: { autonomyTier: "guarded" },
      now,
    })

    expect(presentation.tier).toBe("review")
    expect(presentation.primaryStatus.tone).toBe("caution")
    expect(presentation.action).toMatchObject({
      handler: "focus-plan",
    })
  })

  it("assigns working tier when the customer is awaiting a reply and no plan exists", () => {
    const presentation = buildTicketListPresentation({
      thread: baseThread({
        cachedPlan: null,
        cachedPlanMessageId: null,
        aiSummary: null,
      }),
      now,
    })

    expect(presentation.tier).toBe("working")
    expect(presentation.primaryStatus).toEqual({ label: "Draft reply", tone: "neutral" })
    expect(presentation.action).toMatchObject({
      handler: "draft-reply",
    })
  })

  it("assigns waiting_customer tier when no customer reply is needed", () => {
    const presentation = buildTicketListPresentation({
      thread: baseThread({
        cachedPlan: null,
        cachedPlanMessageId: null,
        aiSummary: null,
        messages: [
          {
            id: customerMessageId,
            threadId: "thread-1",
            senderType: "customer",
            contentText: "How long does shipping take?",
            mediaUrl: null,
            attachments: [],
            sentAt: "2026-06-14T11:30:00.000Z",
          },
          {
            id: "msg-agent-1",
            threadId: "thread-1",
            senderType: "agent",
            contentText: "We ship in 2-3 days.",
            mediaUrl: null,
            attachments: [],
            sentAt: "2026-06-14T11:40:00.000Z",
          },
        ],
      }),
      now,
    })

    expect(presentation.tier).toBe("waiting_customer")
    expect(presentation.primaryStatus).toEqual({ label: "Waiting on customer", tone: "neutral" })
    expect(presentation.action).toBeNull()
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
    expect(compareTicketTriageTier("answer", "review")).toBeLessThan(0)
    expect(compareTicketTriageTier("review", "ready")).toBeLessThan(0)
    expect(compareTicketTriageTier("ready", "working")).toBeLessThan(0)
    expect(compareTicketTriageTier("working", "noise")).toBeLessThan(0)
    expect(compareTicketTriageTier("noise", "waiting_customer")).toBeLessThan(0)
    expect(compareTicketTriageTier("waiting_customer", "closed")).toBeLessThan(0)
  })
})

describe("buildTicketBriefSummary", () => {
  function ticket(overrides: Partial<Ticket> = {}): Ticket {
    return {
      id: "thread-1",
      channelType: "email",
      platform: "Email",
      logo: "/email.svg",
      customer: "Alex Rivera",
      customerRecord: null,
      time: "30m",
      lastMessageAt: "2026-06-14T11:30:00.000Z",
      subject: "Shipping question",
      preview: "How long does shipping take?",
      tag: "Shipping",
      tagColor: "text-slate-500 bg-slate-100 border-slate-200",
      aiSummary: "Customer is asking about shipping times.",
      aiTitle: null,
      status: "open",
      lastCustomerMessageAt: "2026-06-14T11:30:00.000Z",
      hasPlan: true,
      cachedPlan: cacheRecord(quickReplyPlan()),
      cachedPlanMessageId: customerMessageId,
      shopifyCustomerId: null,
      filterStatus: "genuine",
      filterReason: null,
      messages: [{
        id: customerMessageId,
        sender: "customer",
        text: "How long does shipping take?",
        time: "2026-06-14T11:30:00.000Z",
        attachments: [],
      }],
      ...overrides,
    }
  }

  it("uses the same title-style summary as action plan cards", () => {
    expect(buildTicketBriefSummary({
      ticket: ticket({ aiTitle: "Shipping Timeline Question" }),
      plan: quickReplyPlan(),
    })).toBe("Shipping Timeline Question")
  })

  it("falls back to the plan preview title style when no AI title exists", () => {
    expect(buildTicketBriefSummary({
      ticket: ticket(),
      plan: quickReplyPlan(),
    })).toBe("Asking about shipping times.")
  })
})

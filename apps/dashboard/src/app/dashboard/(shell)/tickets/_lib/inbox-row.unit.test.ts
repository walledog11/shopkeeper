import { describe, expect, it } from "vitest"
import { AGENT_PLAN_CACHE_VERSION } from "@shopkeeper/agent/plan-cache-shape"
import {
  buildInboxRow,
  decisionRank,
  isActionDecision,
  resolveInboxSection,
} from "./inbox-row"
import type { Ticket } from "@/types"

const CUSTOMER_MESSAGE_ID = "msg-customer"

function ticket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: "thread-1",
    channelType: "email",
    platform: "Email",
    logo: "/logos/email.svg",
    customer: "Maria Alvarez",
    customerRecord: {
      id: "cust-1",
      organizationId: "org-1",
      name: "Maria Alvarez",
      platformId: "maria@example.com",
      profilePicUrl: null,
      createdAt: "2026-08-01T00:00:00.000Z",
    },
    time: "12m",
    lastMessageAt: "2026-08-16T12:00:00.000Z",
    subject: "Where is my order",
    preview: "Where is my order?",
    tag: "Order Status",
    tagColor: "",
    escalatedAt: null,
    aiSummary: "Customer is asking where order #1848 is.",
    aiTitle: "Order #1848 status",
    status: "open",
    lastCustomerMessageAt: "2026-08-16T12:00:00.000Z",
    hasPlan: false,
    cachedPlan: null,
    cachedPlanMessageId: null,
    shopifyCustomerId: null,
    filterStatus: "genuine",
    filterReason: null,
    requestDisposition: "merchant_action",
    messages: [
      {
        id: CUSTOMER_MESSAGE_ID,
        sender: "customer",
        text: "Where is my order?",
        time: "12:00",
        attachments: [],
      },
    ],
    ...overrides,
  }
}

type StepSeed = { id: string; tool: string; category: string; label: string; description: string }
type ToolCallSeed = { id?: string; name: string; input: Record<string, unknown> }

function withPlan(steps: StepSeed[], rawToolCalls: ToolCallSeed[] = [], warnings: string[] = []) {
  return {
    cachedPlanMessageId: CUSTOMER_MESSAGE_ID,
    hasPlan: true,
    cachedPlan: {
      version: AGENT_PLAN_CACHE_VERSION,
      planId: null,
      instruction: "reply to the customer",
      lastCustomerMessageId: CUSTOMER_MESSAGE_ID,
      settingsFingerprint: "test",
      plan: {
        instruction: "reply to the customer",
        validation: { status: "valid", issues: [] },
        routingEvidence: { classifierState: "not_applicable", codes: [] },
        steps: steps.map(step => ({ ...step, enabled: true })),
        warnings,
        rawToolCalls: rawToolCalls.map((call, index) => ({ id: call.id ?? `call-${index}`, ...call })),
      },
    },
  } satisfies Partial<Ticket>
}

const replyPlan = withPlan(
  [{ id: "s1", tool: "send_reply", category: "communication", label: "Send reply", description: "Reply to Maria" }],
  [{ id: "s1", name: "send_reply", input: { text: "Order #1848 shipped Tuesday — here is your tracking link." } }],
)

const refundPlan = withPlan(
  [{ id: "s1", tool: "create_refund", category: "action", label: "Refund", description: "Refund $42 for a cracked mug" }],
  [{ name: "create_refund", input: { amount: 42 } }],
)

const questionPlan = withPlan(
  [{ id: "s1", tool: "ask_operator", category: "internal", label: "Ask you", description: "Do we still stock the medium?" }],
  [{ name: "ask_operator", input: { question: "Do we still stock the medium?" } }],
)

const escalationPlan = withPlan(
  [{ id: "s1", tool: "escalate_to_human", category: "internal", label: "Escalate", description: "Hand to the merchant" }],
  [{ name: "escalate_to_human", input: { reason: "She is threatening a chargeback." } }],
)

describe("buildInboxRow", () => {
  it("uses aiTitle as the headline when available", () => {
    const row = buildInboxRow(ticket())
    expect(row.headline).toBe("Order #1848 status")
    expect(row.customerLabel).toBe("Maria Alvarez")
    expect(row.channelName).toBe("Email")
  })

  it("offers Send when a reply is drafted and nothing irreversible is in it", () => {
    const row = buildInboxRow(ticket(replyPlan))
    expect(row.decision).toBe("send")
    expect(row.section).toBe("needs_review")
    expect(row.status.label).toBe("Ready to send")
  })

  it("offers Review when money is involved", () => {
    expect(buildInboxRow(ticket(refundPlan)).decision).toBe("review")
  })

  it("offers Answer when the agent needs a fact only the merchant has", () => {
    const row = buildInboxRow(ticket(questionPlan))
    expect(row.decision).toBe("answer")
    expect(row.merchantQuestion).toBe("Do we still stock the medium?")
    expect(row.section).toBe("needs_review")
  })

  it("offers Review on an escalation", () => {
    const row = buildInboxRow(ticket(escalationPlan))
    expect(row.decision).toBe("review")
    expect(["Flagged for you", "Needs review", "Review draft"]).toContain(row.status.label)
  })

  it("routes questionable senders without a plan to trust and the external section", () => {
    const row = buildInboxRow(ticket({
      filterStatus: "questionable",
      filterReason: "This reads like a cold pitch.",
    }))
    expect(row.decision).toBe("trust")
    expect(row.section).toBe("external")
    expect(row.tier).toBe("noise")
    expect(row.isQuestionable).toBe(true)
    expect(row.preview).toBe("This reads like a cold pitch.")
    expect(row.status.label).toBe("Review sender")
  })

  it("keeps questionable senders with a real question in needs review", () => {
    const row = buildInboxRow(ticket({
      filterStatus: "questionable",
      filterReason: "Unrecognized wholesale inquiry.",
      ...questionPlan,
    }))
    expect(row.decision).toBe("answer")
    expect(row.section).toBe("needs_review")
    expect(row.isQuestionable).toBe(true)
  })

  it("routes questionable senders with only a deflection draft to external", () => {
    const row = buildInboxRow(ticket({
      filterStatus: "questionable",
      filterReason: "This sender is not linked to a customer record.",
      ...replyPlan,
    }))
    expect(row.decision).toBeNull()
    expect(row.section).toBe("external")
  })

  it("moves thank-yous to waiting on customer even when a stale plan exists", () => {
    const row = buildInboxRow(ticket({
      requestDisposition: "acknowledgement",
      ...replyPlan,
      messages: [
        { id: CUSTOMER_MESSAGE_ID, sender: "customer", text: "Thank you!", time: "12:00", attachments: [] },
      ],
    }))
    expect(row.decision).toBeNull()
    expect(row.section).toBe("waiting_on_customer")
  })

  it("routes Shopify system notifications to external", () => {
    const row = buildInboxRow(ticket({
      channelType: "shopify",
      customer: "Canary Shopkeeper",
      aiTitle: "Order #1023 Updated",
      messages: [
        { id: "msg-note", sender: "note", text: "Order #1023 has been updated.", time: "12:00", attachments: [] },
      ],
    }))
    expect(row.decision).toBeNull()
    expect(row.section).toBe("external")
  })

  it("puts waiting threads in the waiting section", () => {
    const row = buildInboxRow(ticket({
      messages: [
        { id: CUSTOMER_MESSAGE_ID, sender: "customer", text: "Where is my order?", time: "12:00", attachments: [] },
        { id: "msg-agent", sender: "ai", text: "It shipped Tuesday.", time: "12:01", attachments: [] },
      ],
    }))
    expect(row.decision).toBeNull()
    expect(row.section).toBe("waiting_on_customer")
    expect(row.tier).toBe("waiting_customer")
  })

  it("carries no decision when nothing is pending", () => {
    expect(buildInboxRow(ticket()).decision).toBeNull()
  })

  it("carries no decision once closed, and marks itself for dimming", () => {
    const row = buildInboxRow(ticket({ ...replyPlan, status: "closed" }))
    expect(row.decision).toBeNull()
    expect(row.isClosed).toBe(true)
    expect(row.status.label).toBe("Closed")
  })

  it("attributes the preview when the last message was sent by the agent", () => {
    const row = buildInboxRow(ticket({
      messages: [
        { id: CUSTOMER_MESSAGE_ID, sender: "customer", text: "Where is my order?", time: "12:00", attachments: [] },
        { id: "msg-agent", sender: "ai", text: "It shipped Tuesday — tracking is on its way.", time: "12:01", attachments: [] },
      ],
    }))
    expect(row.preview).toContain("You replied:")
    expect(row.preview).toContain("It shipped Tuesday")
    expect(row.decision).toBeNull()
  })

  it("uses the draft reply as preview, not as the headline", () => {
    const row = buildInboxRow(ticket({
      ...replyPlan,
      aiTitle: "Damaged mug refund",
    }))
    expect(row.headline).toBe("Damaged mug refund")
    expect(row.preview).toContain("Order #1848 shipped Tuesday")
  })
})

describe("resolveInboxSection", () => {
  it("maps triage tiers to inbox sections", () => {
    expect(resolveInboxSection(ticket(), "working", null)).toBe("needs_review")
    expect(resolveInboxSection(ticket(), "waiting_customer", null)).toBe("waiting_on_customer")
    expect(resolveInboxSection(ticket({ filterStatus: "questionable" }), "noise", "trust")).toBe("external")
    expect(resolveInboxSection(ticket({ filterStatus: "filtered" }), "closed", null)).toBe("spam")
    expect(resolveInboxSection(ticket({ channelType: "shopify" }), "review", null)).toBe("external")
    expect(resolveInboxSection(
      ticket({ requestDisposition: "acknowledgement" }),
      "ready",
      "send",
    )).toBe("waiting_on_customer")
  })
})

describe("decisionRank", () => {
  it("ranks actionable work first and trust last", () => {
    expect(decisionRank("send")).toBe(0)
    expect(decisionRank("review")).toBe(0)
    expect(decisionRank("answer")).toBe(0)
    expect(decisionRank(null)).toBe(1)
    expect(decisionRank("trust")).toBe(2)
  })
})

describe("isActionDecision", () => {
  it("identifies send, review, and answer as actionable", () => {
    expect(isActionDecision("send")).toBe(true)
    expect(isActionDecision("trust")).toBe(false)
    expect(isActionDecision(null)).toBe(false)
  })
})

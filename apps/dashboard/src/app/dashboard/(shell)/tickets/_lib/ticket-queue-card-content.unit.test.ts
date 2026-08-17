import { describe, expect, it } from "vitest"
import { AGENT_PLAN_CACHE_VERSION } from "@shopkeeper/agent/plan-cache-shape"
import type { AgentPlan } from "@/types"
import { buildTicketQueueCardContent } from "./ticket-queue-card-content"
import type { TicketPresentationSource } from "./ticket-list-presentation"

const customerMessageId = "msg-customer-1"

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

function baseTicket(overrides: Partial<TicketPresentationSource> = {}): TicketPresentationSource {
  return {
    channelType: "email",
    status: "open",
    lastMessageAt: "2026-06-14T12:00:00.000Z",
    aiSummary: "Customer asked about shipping.",
    subject: "Shipping question",
    tag: "Shipping",
    escalatedAt: null,
    cachedPlan: null,
    cachedPlanMessageId: null,
    filterStatus: "genuine",
    shopifyCustomerId: null,
    customerRecord: {
      id: "cust-1",
      organizationId: "org-1",
      name: "Alex Rivera",
      platformId: "alex@example.com",
      profilePicUrl: null,
      createdAt: "2026-06-01T00:00:00.000Z",
    },
    messages: [{
      id: customerMessageId,
      sender: "customer",
      text: "How long does shipping take?",
      time: "2026-06-14T12:00:00.000Z",
    }],
    ...overrides,
  }
}

describe("buildTicketQueueCardContent", () => {
  it("includes the customer message and drafted reply bubbles", () => {
    const ticket = baseTicket({
      cachedPlan: cacheRecord(quickReplyPlan()),
      cachedPlanMessageId: customerMessageId,
    })

    const content = buildTicketQueueCardContent(ticket)

    expect(content.customerMessage).toBe("How long does shipping take?")
    expect(content.bubbles.some(bubble => bubble.tone === "reply" && bubble.text === "We ship in 2-3 days.")).toBe(true)
    expect(content.meta.customerName).toBe("Alex Rivera")
    expect(content.meta.channelName).toBe("Email")
  })

  it("marks escalation-only plans without reply bubbles", () => {
    const ticket = baseTicket({
      cachedPlan: cacheRecord({
        instruction: "Escalate",
        rawToolCalls: [{ id: "esc-1", name: "escalate_to_human", input: { reason: "Policy exception" } }],
        steps: [{
          id: "esc-1",
          tool: "escalate_to_human",
          label: "Escalate",
          description: "Needs a human",
          category: "action",
          enabled: true,
        }],
      }),
      cachedPlanMessageId: customerMessageId,
    })

    const content = buildTicketQueueCardContent(ticket)

    expect(content.isEscalationOnly).toBe(true)
    expect(content.bubbles).toHaveLength(0)
    expect(content.escalationReason).toContain("Policy exception")
  })

  it("surfaces order numbers from linked Shopify context when the plan has no lookup", () => {
    const ticket = baseTicket({
      tag: "General",
      shopifyCustomerId: "shopify-cust-1",
      aiSummary: "Customer asked about order #2099 shipping status.",
      cachedPlan: cacheRecord(quickReplyPlan()),
      cachedPlanMessageId: customerMessageId,
    })

    const content = buildTicketQueueCardContent(ticket)

    expect(content.meta.orderRef).toBe("#2099")
  })

  it("does not invent order numbers without Shopify linkage", () => {
    const ticket = baseTicket({
      tag: "General",
      aiSummary: "Customer asked about order #2099 shipping status.",
    })

    const content = buildTicketQueueCardContent(ticket)

    expect(content.meta.orderRef).toBeNull()
  })

  it("surfaces order numbers from the plan when available", () => {
    const ticket = baseTicket({
      tag: "General",
      cachedPlan: cacheRecord({
        instruction: "Look up order",
        rawToolCalls: [
          { id: "lookup-1", name: "get_order_by_name", input: { order_name: "1042" } },
          { id: "reply-1", name: "send_reply", input: { text: "Your order is on the way." } },
        ],
        steps: [
          {
            id: "lookup-1",
            tool: "get_order_by_name",
            label: "Look up order",
            description: "Find order #1042",
            category: "action",
            enabled: true,
          },
          {
            id: "reply-1",
            tool: "send_reply",
            label: "Reply",
            description: "Share shipping update",
            category: "communication",
            enabled: true,
          },
        ],
      }),
      cachedPlanMessageId: customerMessageId,
    })

    const content = buildTicketQueueCardContent(ticket)

    expect(content.meta.orderRef).toBe("#1042")
  })

  it("uses the ticket category when there is no order number", () => {
    const ticket = baseTicket({
      tag: "Shipping",
      cachedPlan: cacheRecord(quickReplyPlan()),
      cachedPlanMessageId: customerMessageId,
    })

    const content = buildTicketQueueCardContent(ticket)

    expect(content.meta.orderRef).toBeNull()
    expect(content.meta.tag).toBe("Shipping")
  })

  it("keeps general tags on the meta row for unclassified conversations", () => {
    const ticket = baseTicket({ tag: "General" })

    const content = buildTicketQueueCardContent(ticket)

    expect(content.meta.tag).toBe("General")
  })

  it("uses short topic labels for long category names", () => {
    const ticket = baseTicket({
      tag: "Product Inquiry",
      cachedPlan: cacheRecord(quickReplyPlan()),
      cachedPlanMessageId: customerMessageId,
    })

    const content = buildTicketQueueCardContent(ticket)

    expect(content.meta.tag).toBe("Product Inquiry")
  })

  it("keeps general tags on the meta row for unclassified conversations", () => {
    const ticket = baseTicket({ tag: "General" })

    const content = buildTicketQueueCardContent(ticket)

    expect(content.meta.tag).toBe("General")
  })

  it("uses short topic labels for long category names", () => {
    const ticket = baseTicket({
      tag: "Product Inquiry",
      cachedPlan: cacheRecord(quickReplyPlan()),
      cachedPlanMessageId: customerMessageId,
    })

    const content = buildTicketQueueCardContent(ticket)

    expect(content.meta.tag).toBe("Product Inquiry")
  })

  it("does not echo the customer message as a drafted reply for questionable senders", () => {
    const ticket = baseTicket({
      filterStatus: "questionable",
      messages: [{
        id: customerMessageId,
        sender: "customer",
        text: "Would you like me to drive more sales for your store?",
        time: "2026-06-14T12:00:00.000Z",
      }],
    })

    const content = buildTicketQueueCardContent(ticket)

    expect(content.customerMessage).toBe("Would you like me to drive more sales for your store?")
    expect(content.bubbles).toHaveLength(1)
    expect(content.bubbles[0]?.tone).toBe("flag")
    expect(content.bubbles[0]?.text).not.toContain("drive more sales")
  })
})

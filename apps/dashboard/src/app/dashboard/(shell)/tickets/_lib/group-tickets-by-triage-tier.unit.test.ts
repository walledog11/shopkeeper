import { describe, expect, it } from "vitest"
import { AGENT_PLAN_CACHE_VERSION } from "@shopkeeper/agent/plan-cache-shape"
import { groupTicketsByTriageTier } from "./group-tickets-by-triage-tier"
import type { AgentPlan, Ticket } from "@/types"

const now = "2026-06-14T12:00:00.000Z"

function cacheRecord(plan: AgentPlan, messageId = "msg-customer-1") {
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

function baseTicket(overrides: Partial<Ticket> & Pick<Ticket, "id">): Ticket {
  return {
    id: overrides.id,
    channelType: "email",
    platform: "Email",
    logo: "/channels/email.svg",
    customer: "Alex Customer",
    customerRecord: null,
    time: "2m",
    lastMessageAt: overrides.lastMessageAt ?? now,
    subject: "Where is my order?",
    preview: "Hi, where is my order?",
    tag: "Shipping",
    tagColor: "text-slate-500 bg-slate-100 border-slate-200",
    aiSummary: "Customer asking about order status",
    status: "open",
    lastCustomerMessageAt: now,
    hasPlan: false,
    cachedPlan: null,
    cachedPlanMessageId: null,
    shopifyCustomerId: null,
    filterStatus: "active",
    filterReason: null,
    messages: [{
      id: "msg-customer-1",
      sender: "customer",
      text: "Hi, where is my order?",
      time: now,
      attachments: [],
    }],
    ...overrides,
  }
}

describe("groupTicketsByTriageTier", () => {
  it("groups tickets into ordered non-empty sections", () => {
    const approve = baseTicket({
      id: "approve-1",
      cachedPlan: cacheRecord(quickReplyPlan()),
      cachedPlanMessageId: "msg-customer-1",
      hasPlan: true,
      lastMessageAt: "2026-06-14T12:10:00.000Z",
    })
    const review = baseTicket({
      id: "review-1",
      filterStatus: "questionable",
      cachedPlan: cacheRecord(quickReplyPlan()),
      cachedPlanMessageId: "msg-customer-1",
      hasPlan: true,
      lastMessageAt: "2026-06-14T12:05:00.000Z",
    })
    const waiting = baseTicket({
      id: "waiting-1",
      lastMessageAt: "2026-06-14T12:00:00.000Z",
    })
    const noise = baseTicket({
      id: "noise-1",
      filterStatus: "questionable",
      lastMessageAt: "2026-06-14T11:00:00.000Z",
    })

    const groups = groupTicketsByTriageTier([noise, waiting, review, approve], {})

    expect(groups.map(group => group.tier)).toEqual(["approve", "review", "waiting", "noise"])
    expect(groups[0].tickets.map(ticket => ticket.id)).toEqual(["approve-1"])
    expect(groups[1].label).toBe("Needs review")
    expect(groups[2].defaultExpanded).toBe(false)
    expect(groups[2].collapsible).toBe(true)
    expect(groups[3].label).toBe("Likely spam")
    expect(groups[3].defaultExpanded).toBe(false)
  })

  it("hides empty tiers", () => {
    const approve = baseTicket({
      id: "approve-1",
      cachedPlan: cacheRecord(quickReplyPlan()),
      cachedPlanMessageId: "msg-customer-1",
      hasPlan: true,
    })

    const groups = groupTicketsByTriageTier([approve], {})

    expect(groups).toHaveLength(1)
    expect(groups[0].tier).toBe("approve")
  })
})

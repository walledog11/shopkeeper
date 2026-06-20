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
    filterStatus: "genuine",
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

describe("groupTicketsByTriageTier", () => {
  it("groups tickets into ordered non-empty sections", () => {
    const answer = baseTicket({
      id: "answer-1",
      cachedPlan: cacheRecord(askOperatorPlan()),
      cachedPlanMessageId: "msg-customer-1",
      hasPlan: true,
      lastMessageAt: "2026-06-14T12:15:00.000Z",
    })
    const ready = baseTicket({
      id: "ready-1",
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
    const working = baseTicket({
      id: "working-1",
      lastMessageAt: "2026-06-14T12:00:00.000Z",
    })
    const noise = baseTicket({
      id: "noise-1",
      filterStatus: "questionable",
      lastMessageAt: "2026-06-14T11:00:00.000Z",
    })

    const groups = groupTicketsByTriageTier([noise, working, review, ready, answer], {})

    expect(groups.map(group => group.tier)).toEqual(["answer", "review", "ready", "working", "noise"])
    expect(groups[0].label).toBe("Needs your answer")
    expect(groups[0].tickets.map(ticket => ticket.id)).toEqual(["answer-1"])
    expect(groups[1].label).toBe("Needs review")
    expect(groups[2].label).toBe("Ready to send")
    expect(groups[3].label).toBe("Agent working")
    expect(groups[3].defaultExpanded).toBe(false)
    expect(groups[3].collapsible).toBe(true)
    expect(groups[4].label).toBe("Possible spam")
    expect(groups[4].defaultExpanded).toBe(false)
  })

  it("hides empty tiers", () => {
    const ready = baseTicket({
      id: "ready-1",
      cachedPlan: cacheRecord(quickReplyPlan()),
      cachedPlanMessageId: "msg-customer-1",
      hasPlan: true,
    })

    const groups = groupTicketsByTriageTier([ready], {})

    expect(groups).toHaveLength(1)
    expect(groups[0].tier).toBe("ready")
  })

  it("includes waiting-on-customer tickets only for all open", () => {
    const waitingCustomer = baseTicket({
      id: "waiting-customer-1",
      messages: [
        {
          id: "msg-customer-1",
          sender: "customer",
          text: "Hi, where is my order?",
          time: "2026-06-14T11:30:00.000Z",
          attachments: [],
        },
        {
          id: "msg-agent-1",
          sender: "agent",
          text: "Your order shipped yesterday.",
          time: "2026-06-14T11:40:00.000Z",
          attachments: [],
        },
      ],
    })

    expect(groupTicketsByTriageTier([waitingCustomer], {
      listView: "for_me",
    })).toEqual([])

    const groups = groupTicketsByTriageTier([waitingCustomer], {
      listView: "all_open",
    })

    expect(groups).toHaveLength(1)
    expect(groups[0].tier).toBe("waiting_customer")
    expect(groups[0].label).toBe("Waiting on customer")
    expect(groups[0].collapsible).toBe(true)
    expect(groups[0].defaultExpanded).toBe(false)
  })

  it("groups closed tickets into a closed section for the closed view", () => {
    const closed = baseTicket({
      id: "closed-1",
      status: "closed",
      lastMessageAt: "2026-06-14T12:20:00.000Z",
    })

    const groups = groupTicketsByTriageTier([closed], {
      listView: "closed",
      activeTab: "closed",
    })

    expect(groups).toHaveLength(1)
    expect(groups[0].tier).toBe("closed")
    expect(groups[0].label).toBe("Closed")
    expect(groups[0].tickets.map(ticket => ticket.id)).toEqual(["closed-1"])
  })
})

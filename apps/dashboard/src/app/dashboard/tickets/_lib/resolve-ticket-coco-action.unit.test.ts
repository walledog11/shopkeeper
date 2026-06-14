import { describe, expect, it } from "vitest"
import { AGENT_PLAN_CACHE_VERSION } from "@shopkeeper/agent/plan-cache-shape"
import { resolveTicketCocoAction } from "./resolve-ticket-coco-action"
import type { AgentPlan } from "@/types"

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

const baseInput = {
  activeTab: "open" as const,
  agentBusy: false,
  hasShopify: true,
  orgSettings: { autonomyTier: "guarded" as const },
  shopifyCustomerId: "shopify-1",
  channelType: "email",
  lastCustomerMessageAt: new Date().toISOString(),
  messages: [{ id: customerMessageId, senderType: "customer" }],
  thread: {
    cachedPlan: cacheRecord(quickReplyPlan()),
    cachedPlanMessageId: customerMessageId,
  },
}

describe("resolveTicketCocoAction", () => {
  it("returns null on closed tickets", () => {
    expect(resolveTicketCocoAction({ ...baseInput, activeTab: "closed" })).toBeNull()
  })

  it("returns working state while the agent is busy", () => {
    expect(resolveTicketCocoAction({ ...baseInput, agentBusy: true })).toMatchObject({
      label: "Working…",
      disabled: true,
    })
  })

  it("returns send reply for quick_reply plans", () => {
    expect(resolveTicketCocoAction(baseInput)).toMatchObject({
      label: "Send reply",
      handler: "quick-approve",
      variant: "send",
    })
  })

  it("returns review refund for consequential refund plans", () => {
    expect(resolveTicketCocoAction({
      ...baseInput,
      thread: {
        cachedPlan: cacheRecord(refundPlan()),
        cachedPlanMessageId: customerMessageId,
      },
    })).toMatchObject({
      label: "Review refund",
      handler: "focus-plan",
      variant: "caution",
    })
  })

  it("returns link customer when a plan needs Shopify context", () => {
    const orderPlan: AgentPlan = {
      instruction: "Look up order and reply",
      warnings: ["Couldn't find a Shopify customer linked to this thread."],
      rawToolCalls: [
        { id: "lookup-1", name: "get_shopify_orders", input: {} },
        { id: "reply-1", name: "send_reply", input: { text: "Your order is on the way." } },
      ],
      steps: [
        {
          id: "lookup-1",
          tool: "get_shopify_orders",
          label: "Look up orders",
          description: "Find customer orders",
          category: "read",
          enabled: true,
        },
        {
          id: "reply-1",
          tool: "send_reply",
          label: "Reply",
          description: "Send update",
          category: "communication",
          enabled: true,
        },
      ],
    }

    expect(resolveTicketCocoAction({
      ...baseInput,
      shopifyCustomerId: null,
      thread: {
        cachedPlan: cacheRecord(orderPlan),
        cachedPlanMessageId: customerMessageId,
      },
    })).toMatchObject({
      label: "Link customer",
      handler: "link-customer",
    })
  })

  it("returns refresh draft when the cached plan is stale", () => {
    expect(resolveTicketCocoAction({
      ...baseInput,
      messages: [{ id: "msg-customer-2", senderType: "customer" }],
      thread: {
        cachedPlan: cacheRecord(quickReplyPlan()),
        cachedPlanMessageId: customerMessageId,
      },
    })).toMatchObject({
      label: "Refresh draft",
      handler: "refresh-draft",
    })
  })

  it("returns draft reply when the customer is waiting and no valid plan exists", () => {
    expect(resolveTicketCocoAction({
      ...baseInput,
      thread: {
        cachedPlan: null,
        cachedPlanMessageId: null,
      },
    })).toMatchObject({
      label: "Draft reply",
      handler: "draft-reply",
    })
  })

  it("returns null when the merchant already replied and no plan is pending", () => {
    expect(resolveTicketCocoAction({
      ...baseInput,
      messages: [{ id: "msg-agent-1", senderType: "agent" }],
      thread: {
        cachedPlan: null,
        cachedPlanMessageId: null,
      },
    })).toBeNull()
  })

  it("returns null when Instagram reply window expired", () => {
    expect(resolveTicketCocoAction({
      ...baseInput,
      channelType: "ig_dm",
      lastCustomerMessageAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
      thread: {
        cachedPlan: null,
        cachedPlanMessageId: null,
      },
    })).toBeNull()
  })
})

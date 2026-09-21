import { AGENT_PLAN_CACHE_VERSION } from "@shopkeeper/agent/plan-cache-shape"
import type { Ticket } from "@/types"

const CUSTOMER_MESSAGE_ID = "msg-customer"

export function inboxStreamTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: "thread-1",
    channelType: "email",
    platform: "Email",
    logo: "/logos/email.svg",
    customer: "Maria Alvarez",
    customerRecord: null,
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
    messages: [{
      id: CUSTOMER_MESSAGE_ID,
      sender: "customer",
      text: "Where is my order?",
      time: "12:00",
      attachments: [],
    }],
    ...overrides,
  }
}

export const sendReadyTicket = inboxStreamTicket({
  id: "thread-send",
  hasPlan: true,
  cachedPlanMessageId: CUSTOMER_MESSAGE_ID,
  cachedPlan: {
    version: AGENT_PLAN_CACHE_VERSION,
    planId: "plan-send-1",
    instruction: "reply to the customer",
    lastCustomerMessageId: CUSTOMER_MESSAGE_ID,
    settingsFingerprint: "test",
    plan: {
      instruction: "reply to the customer",
      validation: { status: "valid", issues: [] },
      routingEvidence: { classifierState: "not_applicable", codes: [] },
      steps: [{
        id: "s1",
        tool: "send_reply",
        category: "communication",
        label: "Send reply",
        description: "Reply",
        enabled: true,
      }],
      warnings: [],
      rawToolCalls: [{
        id: "s1",
        name: "send_reply",
        input: { text: "It shipped Tuesday." },
      }],
    },
  },
})

export const questionableTicket = inboxStreamTicket({
  id: "thread-trust",
  filterStatus: "questionable",
  filterReason: "This reads like a cold pitch.",
})

export const spamTicket = inboxStreamTicket({
  id: "thread-spam",
  filterStatus: "filtered",
  filterReason: "Bulk promo.",
})

// Contexts, model responses and orders shared by the planAgent suites.
import { expect, vi } from "vitest";
import type { AgentLogger } from "../logger.js";
import type { AgentContext } from "../agent-context.js";
import { emptyIntents, emptyRequestFacts, type ClassifierIntents, type RequestFacts } from "../classifier-signals.js";

export function makeLogger(): AgentLogger {
  return {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
}

export function makeCtx(overrides: Partial<AgentContext> = {}): AgentContext {
  return {
    orgId: "org_1",
    orgName: "Test Store",
    customer: { id: "customer_1", name: "Jane", platformId: "jane@test.com" },
    recentMessages: [{ senderType: "customer", contentText: "Help me" }],
    openThreadCount: 1,
    shopify: { shop: "test-store.myshopify.com", accessToken: "shpat_test" },
    recentOrders: [],
    linkedShopifyCustomerName: null,
    kbArticles: [],
    merchantPreferences: [],
    thread: {
      id: "thread_1",
      status: "open",
      channelType: "email",
      tag: "Support",
      aiSummary: null,
      shopifyCustomerId: "shopify_customer_1",
    },
    escalate: vi.fn().mockResolvedValue(undefined),
    io: {
      addInternalNote: vi.fn(),
      sendReply: vi.fn(),
      sendEmail: vi.fn(),
      updateThreadStatus: vi.fn(),
      updateThreadTag: vi.fn(),
    },
    ...overrides,
  };
}

export function classifierSignalsFor(intents: Partial<ClassifierIntents>, facts: Partial<RequestFacts> = {}) {
  return {
    version: 2,
    language: "en",
    intents: { ...emptyIntents(), ...intents },
    requestFacts: { ...emptyRequestFacts(), ...facts },
  };
}

export function singleToolUse(name: string, input: Record<string, unknown>, id = "tu_1") {
  return {
    stop_reason: "tool_use",
    content: [{ type: "tool_use", id, name, input }],
    usage: { input_tokens: 10, output_tokens: 5 },
  };
}

export function toolUses(calls: { id: string; name: string; input: Record<string, unknown> }[]) {
  return {
    stop_reason: "tool_use",
    content: calls.map(call => ({ type: "tool_use", ...call })),
    usage: { input_tokens: 10, output_tokens: 5 },
  };
}

export function endTurn(text = "Working on it.") {
  return {
    stop_reason: "end_turn",
    content: [{ type: "text", text }],
    usage: { input_tokens: 10, output_tokens: 5 },
  };
}

export function completeLogPayload(logger: AgentLogger) {
  const call = logger.info.mock.calls.find(([, message]) => message === "[agent:plan] complete");
  expect(call).toBeDefined();
  return call![0] as {
    iterations: number;
    reprompted: boolean;
    modelCalls: number;
    rawToolCallCount: number;
    visibleStepCount: number;
    routingDecision: string | null;
    toolSelectionBucket: string;
    toolSelectionNarrowed: boolean;
    namespaceMiss: boolean;
    namespaceMissReason: string | null;
    validationStatus: string;
    supersededValidationIssueCodes: string[] | null;
  };
}

export const REFUNDED_ORDER_1020 = {
  id: "9000001020",
  name: "#1020",
  created_at: "2026-05-08T09:00:00-07:00",
  financial_status: "refunded",
  fulfillment_status: "fulfilled",
  total_price: "38.00",
  currency: "USD",
  items: [],
  shipping_address: null,
};

export const FULFILLED_ORDER_4003 = {
  id: "9000004003",
  name: "#4003",
  created_at: "2026-05-15T10:00:00-07:00",
  financial_status: "paid",
  fulfillment_status: "fulfilled",
  total_price: "42.00",
  currency: "USD",
  items: [],
  shipping_address: null,
};

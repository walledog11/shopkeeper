import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installAgentLogger, resetAgentLoggerForTests, type AgentLogger } from "./logger.js";
import { planAgent } from "./planner.js";
import type { AgentContext } from "./agent-context.js";

const {
  mockCreate,
  mockEnforceSpendCap,
  mockRecordSpend,
} = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockEnforceSpendCap: vi.fn().mockResolvedValue(undefined),
  mockRecordSpend: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class Anthropic {
    messages = { create: mockCreate };
  },
}));

vi.mock("./spend.js", () => ({
  enforceSpendCap: mockEnforceSpendCap,
  recordSpend: mockRecordSpend,
  getDailySpendNano: vi.fn().mockResolvedValue(0),
}));

function makeLogger(): AgentLogger {
  return {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
}

function makeCtx(overrides: Partial<AgentContext> = {}): AgentContext {
  return {
    orgId: "org_1",
    orgName: "Test Store",
    customer: { id: "customer_1", name: "Jane", platformId: "jane@test.com" },
    customerMemory: null,
    recentMessages: [{ senderType: "customer", contentText: "Help me" }],
    openThreadCount: 1,
    shopify: null,
    recentOrders: [],
    linkedShopifyCustomerName: null,
    kbArticles: [],
    thread: {
      id: "thread_1",
      status: "open",
      channelType: "dashboard_agent",
      tag: "Support",
      aiSummary: null,
      shopifyCustomerId: null,
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

beforeEach(() => {
  mockCreate.mockReset();
  mockEnforceSpendCap.mockResolvedValue(undefined);
  mockRecordSpend.mockResolvedValue(undefined);
});

afterEach(() => {
  resetAgentLoggerForTests();
  vi.clearAllMocks();
});

describe("planAgent logging", () => {
  it("uses the injected logger for planner lifecycle logs", async () => {
    const injectedLogger = makeLogger();
    installAgentLogger(injectedLogger);
    mockCreate.mockResolvedValueOnce({
      stop_reason: "end_turn",
      content: [{ type: "text", text: "No action needed." }],
      usage: { input_tokens: 10, output_tokens: 5 },
    });

    await planAgent(makeCtx(), "Check this thread");

    expect(injectedLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org_1",
        threadId: "thread_1",
        channelType: "dashboard_agent",
        messageCount: 2,
      }),
      "[agent:plan] start",
    );
    expect(injectedLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org_1",
        threadId: "thread_1",
        rawToolCallCount: 0,
        visibleStepCount: 0,
      }),
      "[agent:plan] complete",
    );
  });
});

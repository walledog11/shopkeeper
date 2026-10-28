import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installAgentLogger, resetAgentLoggerForTests } from "./logger.js";
import { planAgent } from "./planner.js";
import { AGENT_SETTINGS_DEFAULTS, resolveAgentSettings } from "./settings.js";
import { decideAutonomy } from "./autonomy.js";
import { emptyRequestFacts } from "./classifier-signals.js";
import {
  FULFILLED_ORDER_4003,
  REFUNDED_ORDER_1020,
  classifierSignalsFor,
  completeLogPayload,
  endTurn,
  makeCtx,
  makeLogger,
  singleToolUse,
  toolUses,
} from "./test-fixtures/planner.js";

const {
  mockCreate,
  mockEnforceSpendCap,
  mockRecordSpend,
  mockExecutePlanningReadTools,
} = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockEnforceSpendCap: vi.fn().mockResolvedValue(undefined),
  mockRecordSpend: vi.fn().mockResolvedValue(undefined),
  mockExecutePlanningReadTools: vi.fn(),
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

// planAgent persists its turn usage; keep that write off the database here.
vi.mock("./agent-actions.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./agent-actions.js")>()),
  recordAgentTurnUsage: vi.fn().mockResolvedValue(undefined),
}));

// Reads execute for real in capture mode; stub the read executor so tests never
// hit Shopify/DB while the warning + routing pipeline stays real.
vi.mock("./planner-read-tools.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./planner-read-tools.js")>();
  return {
    ...actual,
    executePlanningReadTools: mockExecutePlanningReadTools,
  };
});

function toolNamesForCall(index: number): string[] {
  return mockCreate.mock.calls[index]![0].tools.map((tool: { name: string }) => tool.name);
}

beforeEach(() => {
  mockCreate.mockReset();
  mockEnforceSpendCap.mockResolvedValue(undefined);
  mockRecordSpend.mockResolvedValue(undefined);
  mockExecutePlanningReadTools.mockImplementation(async ({ readBlocks }) => ({
    readToolCalls: readBlocks.map((block: { name: string }) => block.name),
    readResultsMap: new Map(readBlocks.map((block: { id: string }) => [block.id, "Read result"])),
    readStatusMap: new Map(readBlocks.map((block: { id: string }) => [block.id, "ok"])),
  }));
});

afterEach(() => {
  resetAgentLoggerForTests();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe("planAgent routing", () => {
  it.each([
    { continuation: undefined, instruction: 'The store owner answered your question with: "Use these care instructions."' },
    { continuation: "revision", instruction: 'The store owner answered your question with: "Use these care instructions."' },
    { continuation: "answer", instruction: "The merchant says to hand-wash it in cold water." },
  ] as const)("uses continuation metadata after a KB miss ($continuation)", async ({ continuation, instruction }) => {
    installAgentLogger(makeLogger());
    mockExecutePlanningReadTools.mockResolvedValue({
      readToolCalls: ["search_kb"],
      readResultsMap: new Map([["tu_kb", "No matching articles"]]),
      readStatusMap: new Map([["tu_kb", "not_found"]]),
    });
    mockCreate
      .mockResolvedValueOnce(singleToolUse("search_kb", { query: "care instructions" }, "tu_kb"))
      .mockResolvedValueOnce(singleToolUse("send_reply", { text: "Hand-wash it in cold water." }, "tu_reply"))
      .mockResolvedValueOnce(singleToolUse("ask_operator", { question: "What care instructions should I give the customer?" }, "tu_ask"));

    const plan = await planAgent(
      makeCtx({ classifierSignals: classifierSignalsFor({ policy_question: true }) }),
      instruction,
      AGENT_SETTINGS_DEFAULTS,
      { merchantInstruction: continuation !== undefined, merchantContinuation: continuation },
    );

    const answered = continuation === "answer";
    expect(toolNamesForCall(0).includes("ask_operator")).toBe(!answered);
    expect(plan.rawToolCalls.map((call) => call.name)).toEqual(["search_kb", answered ? "send_reply" : "ask_operator"]);
    const verdict = decideAutonomy(plan, AGENT_SETTINGS_DEFAULTS);
    if (answered) {
      expect(verdict.kind).not.toBe("needs_merchant_input");
      expect(plan.routingEvidence?.codes).not.toContain("kb_gap");
    } else {
      expect(verdict.kind).toBe("needs_merchant_input");
    }
  });

  // The attempt after an approved message was withheld: the model is offered no
  // write, and the reply it drafts is held for the merchant even where a
  // reply-only plan would otherwise send itself.
  it("drafts a withheld-message follow-up for review with no write offered", async () => {
    installAgentLogger(makeLogger());
    mockCreate.mockResolvedValueOnce(singleToolUse("send_reply", { text: "We couldn't complete your refund yet." }));

    const plan = await planAgent(
      makeCtx({ classifierSignals: classifierSignalsFor({ mutative_request: true }) }),
      "Refund the order. The message was not sent.",
      resolveAgentSettings({ autonomyTier: "trusted", autoExecuteMode: "live" }),
      { withheldMessageFollowUp: true },
    );

    const offered = toolNamesForCall(0);
    expect(offered).toContain("send_reply");
    expect(offered).not.toContain("create_refund");
    expect(offered).not.toContain("request_wider_tool_set");
    expect(plan.signals).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "approved_message_withheld", severity: "blocking" }),
    ]));
    expect(decideAutonomy(plan, resolveAgentSettings({ autonomyTier: "trusted", autoExecuteMode: "live" })))
      .toMatchObject({ kind: "needs_review", approvalAllowed: true });
  });

  // Regression for the C08 held-out: the request that led to the withheld
  // message still says "cancel" and names a shipped order, which is why Shopify
  // refused it. Judging that request's write again replaced the draft with an
  // escalation on every such follow-up.
  it("keeps a follow-up draft after Shopify refused to cancel a shipped order", async () => {
    installAgentLogger(makeLogger());
    const draft = "We couldn't cancel #4003 because it had already shipped. You can return it once it arrives.";
    mockCreate.mockResolvedValueOnce(singleToolUse("send_reply", { text: draft }));

    const plan = await planAgent(
      makeCtx({
        recentMessages: [{ senderType: "customer", contentText: "Please cancel order #4003, I ordered the wrong size." }],
        recentOrders: [FULFILLED_ORDER_4003],
        classifierSignals: classifierSignalsFor({ mutative_request: true }),
      }),
      "Customer wants order #4003 cancelled. The message was not sent: cancel_order (error): the order has already been fulfilled.",
      AGENT_SETTINGS_DEFAULTS,
      { withheldMessageFollowUp: true },
    );

    expect(plan.rawToolCalls.map((toolCall) => toolCall.name)).toEqual(["send_reply"]);
    expect(plan.routingEvidence?.codes).not.toContain("fulfilled_cancellation_request");
    expect(decideAutonomy(plan, AGENT_SETTINGS_DEFAULTS)).toMatchObject({ kind: "needs_review" });
  });

  it("escalates a compensation request with no safe action", async () => {
    installAgentLogger(makeLogger());
    mockCreate.mockResolvedValueOnce(singleToolUse("send_reply", { text: "Your refund is on the way." }, "tu_reply"));

    const plan = await planAgent(
      makeCtx({
        recentMessages: [{ senderType: "customer", contentText: "Please refund me for order #4003." }],
        recentOrders: [FULFILLED_ORDER_4003],
        classifierSignals: classifierSignalsFor({ mutative_request: true, compensation_request: true }, { ask: "refund", order: "#4003" }),
      }),
      "Reply to the customer and process their refund request.",
      AGENT_SETTINGS_DEFAULTS,
    );

    expect(plan.rawToolCalls.map((toolCall) => toolCall.name)).toEqual(["escalate_to_human"]);
    expect(plan.routing).toBeUndefined();
    expect(plan.signals?.map((signal) => signal.code)).toContain("mutative_intent_no_action");
  });

  it("materializes a deterministic escalation for out-of-scope commercial requests", async () => {
    installAgentLogger(makeLogger());
    mockCreate.mockResolvedValueOnce(singleToolUse("send_reply", { text: "Sure!" }, "tu_reply"));

    const plan = await planAgent(
      makeCtx({
        recentMessages: [{ senderType: "customer", contentText: "Can you give me wholesale pricing on 10,000 units?" }],
        classifierSignals: classifierSignalsFor({ out_of_scope_commercial: true }),
      }),
      "Handle this ticket.",
      AGENT_SETTINGS_DEFAULTS,
    );

    expect(plan.routing).toBeUndefined();
    expect(plan.routingEvidence?.codes).toContain("out_of_scope_commercial_request");
    expect(plan.rawToolCalls.map((toolCall) => toolCall.name)).toEqual(["escalate_to_human"]);
  });

  // Regression for the `refund-already-refunded` eval fixture: the model wrote a
  // note plus a reply, which is invalid as an orphan note, and validity used to
  // gate the whole routing block — so the escalate verdict never reached the
  // plan and the merchant saw a reply on an order already refunded in full.
  it("materializes the escalation when the invalid draft would have suppressed it", async () => {
    const injectedLogger = makeLogger();
    installAgentLogger(injectedLogger);
    mockCreate.mockResolvedValueOnce(toolUses([
      { id: "tu_note", name: "add_internal_note", input: { text: "Customer asked about a prior refund." } },
      { id: "tu_reply", name: "send_reply", input: { text: "That order was already refunded." } },
    ]));

    const plan = await planAgent(
      makeCtx({
        recentMessages: [{
          senderType: "customer",
          contentText: "Can I get a refund for order #1020? It never worked out.",
        }],
        recentOrders: [REFUNDED_ORDER_1020],
        classifierSignals: classifierSignalsFor({ mutative_request: true }, { ask: "refund", order: "#1020" }),
      }),
      "Reply to the customer about their refund request.",
      AGENT_SETTINGS_DEFAULTS,
    );

    expect(plan.rawToolCalls.map((toolCall) => toolCall.name)).toEqual(["escalate_to_human"]);
    expect(plan.routingEvidence?.codes).toContain("already_refunded_request");
    // The plan the merchant approves is system-authored, so it validates.
    expect(plan.validation).toEqual({ status: "valid", issues: [] });
    expect(completeLogPayload(injectedLogger)).toMatchObject({
      routingDecision: "escalate",
      validationStatus: "valid",
      supersededValidationIssueCodes: ["orphan_internal_note"],
    });
  });

  it("holds a reply the claim check flags for review instead of invalidating it", async () => {
    installAgentLogger(makeLogger());
    const reply = "I've issued the wholesale refund.";
    mockCreate.mockResolvedValueOnce(singleToolUse("send_reply", { text: reply }, "tu_reply"));

    const plan = await planAgent(
      makeCtx({
        recentMessages: [{ senderType: "customer", contentText: "Can you give me wholesale pricing and refund me?" }],
      }),
      "Handle this ticket.",
      AGENT_SETTINGS_DEFAULTS,
    );

    expect(plan.validation).toEqual({ status: "valid", issues: [] });
    expect(plan.rawToolCalls).toEqual([
      { id: "tu_reply", name: "send_reply", input: { text: reply } },
    ]);
    expect(plan.signals).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "ungrounded_customer_reply", severity: "blocking" }),
    ]));
    expect(decideAutonomy(plan, resolveAgentSettings({ autonomyTier: "trusted", autoExecuteMode: "live" })))
      .toMatchObject({ kind: "needs_review", approvalAllowed: true });
  });
});

describe("planAgent transcript integrity", () => {
  // Every model call must ship a tool_result for each prior tool_use, or the
  // Anthropic API rejects it with `400 tool_use without tool_result`. The loop
  // mutates the message array in place, so snapshot each call's messages at send
  // time rather than inspecting the (final) shared reference afterwards.
  function expectValidToolPairing(snapshots: Array<Array<{ role: string; content: unknown }>>) {
    for (const [callIndex, messages] of snapshots.entries()) {
      const toolResultIds = new Set<string>();
      for (const message of messages) {
        if (!Array.isArray(message.content)) continue;
        for (const block of message.content as Array<{ type: string; tool_use_id?: string }>) {
          if (block.type === "tool_result" && block.tool_use_id) toolResultIds.add(block.tool_use_id);
        }
      }
      for (const message of messages) {
        if (!Array.isArray(message.content)) continue;
        for (const block of message.content as Array<{ type: string; id?: string }>) {
          if (block.type === "tool_use" && block.id) {
            expect(
              toolResultIds.has(block.id),
              `model call ${callIndex} sent tool_use ${block.id} without a matching tool_result`,
            ).toBe(true);
          }
        }
      }
    }
  }

  it("pairs a read and a non-read emitted together before the next iteration", async () => {
    installAgentLogger(makeLogger());
    const snapshots: Array<Array<{ role: string; content: unknown }>> = [];
    const responses = [
      {
        stop_reason: "tool_use",
        content: [
          { type: "tool_use", id: "tu_read", name: "search_kb", input: { query: "refund policy" } },
          { type: "tool_use", id: "tu_refund", name: "create_refund", input: { order_id: "123", amount: "10.00" } },
        ],
        usage: { input_tokens: 10, output_tokens: 5 },
      },
      singleToolUse("send_reply", { text: "Done." }, "tu_reply"),
    ];
    let callIndex = 0;
    mockCreate.mockImplementation(async (params: { messages: Array<{ role: string; content: unknown }> }) => {
      snapshots.push(structuredClone(params.messages));
      return responses[Math.min(callIndex++, responses.length - 1)];
    });

    await planAgent(makeCtx(), "Please refund my order", AGENT_SETTINGS_DEFAULTS);

    expectValidToolPairing(snapshots);
  });

  it("starts the low-tier re-plan from a clean transcript", async () => {
    // Regression: runAgentLoop appends to the message array in place, so reusing
    // the same array for the judgment-tier re-plan replayed the discarded
    // low-tier attempt's turns and the API rejected the sequence with
    // `400 tool_use ids were found without tool_result blocks`. Caught by the
    // eval suite on fulfill-merchant-confirmed-shipment, where the low tier
    // proposes fulfill_order and the safety net forces the re-plan.
    installAgentLogger(makeLogger());
    vi.stubEnv("AGENT_PLANNER_TIER_MODE", "low_risk_haiku");

    const snapshots: Array<Array<{ role: string; content: unknown }>> = [];
    const models: string[] = [];
    const responses = [
      // Low tier proposes a mutative action, which the outward check rejects.
      singleToolUse("create_refund", { order_id: "123", amount: "10.00" }, "tu_refund"),
      // Judgment tier re-plans from scratch.
      singleToolUse("send_reply", { text: "Looking into it." }, "tu_reply"),
    ];
    let callIndex = 0;
    mockCreate.mockImplementation(async (params: {
      model: string;
      messages: Array<{ role: string; content: unknown }>;
    }) => {
      models.push(params.model);
      snapshots.push(structuredClone(params.messages));
      return responses[Math.min(callIndex++, responses.length - 1)];
    });

    const ctx = makeCtx({
      classifierSignals: {
        version: 1,
        language: "en",
        intents: {
          mutative_request: false,
          policy_question: false,
          order_status: true,
          fraud_signals: false,
          contradiction: false,
          out_of_scope_commercial: false,
          forwarded_injection: false,
        },
      },
    });
    await planAgent(ctx, "Where is my order?", AGENT_SETTINGS_DEFAULTS);

    // Keyed on the model switch rather than a call count: the low tier may take
    // more than one iteration to land on a terminal tool, and the property under
    // test holds regardless of how many.
    const replanIndex = models.findIndex((model) => model !== models[0]);
    expect(replanIndex).toBeGreaterThan(0);
    // The re-plan starts from the same transcript the first attempt did, with
    // none of the discarded attempt's turns carried over.
    expect(snapshots[replanIndex]).toEqual(snapshots[0]);
    expectValidToolPairing(snapshots);
  });
});

describe("planAgent capability discovery", () => {
  function enableDiscovery() {
    vi.stubEnv("AGENT_CAPABILITY_DISCOVERY_MODE", "discover");
  }

  it("adds a discovered capability to the same turn instead of re-planning", async () => {
    enableDiscovery();
    const injectedLogger = makeLogger();
    installAgentLogger(injectedLogger);
    const snapshots: unknown[][] = [];
    const responses = [
      singleToolUse("discover_capabilities", { capability: "refund an order" }, "tu_discover"),
      singleToolUse("create_refund", { order_id: "123", amount: "10.00" }, "tu_refund"),
      singleToolUse("send_reply", { text: "Refunded." }, "tu_reply"),
    ];
    let callIndex = 0;
    mockCreate.mockImplementation(async (params: { messages: unknown[] }) => {
      snapshots.push(structuredClone(params.messages));
      return responses[Math.min(callIndex++, responses.length - 1)];
    });

    const plan = await planAgent(makeCtx(), "Sort this out for them");

    expect(toolNamesForCall(0)).not.toContain("create_refund");
    expect(toolNamesForCall(1)).toContain("create_refund");
    // The attempt continues rather than restarting: the second call still
    // carries the first, and the discovery answer sits between them.
    expect(snapshots[1]!.length).toBeGreaterThan(snapshots[0]!.length);
    expect(JSON.stringify(snapshots[1])).toContain("create_refund");
    // Discovery is a loop control, not something the merchant approves.
    expect(plan.rawToolCalls.map((call) => call.name)).toEqual(["create_refund", "send_reply"]);
    expect(plan.namespaceMiss).toBeUndefined();
    expect(toolNamesForCall(0)).not.toContain("request_wider_tool_set");
  });

  it("tells the model a capability is out of reach rather than widening", async () => {
    enableDiscovery();
    installAgentLogger(makeLogger());
    mockCreate
      .mockResolvedValueOnce(singleToolUse("discover_capabilities", { capability: "book a courier" }, "tu_discover"))
      .mockResolvedValueOnce(singleToolUse("escalate_to_human", { reason: "Needs a courier booking." }, "tu_escalate"));

    const plan = await planAgent(makeCtx(), "Get a courier to collect this");

    expect(mockCreate).toHaveBeenCalledTimes(2);
    const secondCallTools = toolNamesForCall(1);
    expect(secondCallTools).toEqual(toolNamesForCall(0));
    expect(JSON.stringify(mockCreate.mock.calls[1]![0].messages))
      .toContain("No capability you are authorized to use matches");
    expect(plan.namespaceMiss).toBeUndefined();
  });

  it("does not widen an empty plan to the full registry", async () => {
    enableDiscovery();
    const injectedLogger = makeLogger();
    installAgentLogger(injectedLogger);
    mockCreate
      .mockResolvedValueOnce(endTurn("I need another capability."))
      .mockResolvedValueOnce(endTurn("I still need another capability."));

    const plan = await planAgent(makeCtx({
      classifierSignals: {
        ...classifierSignalsFor({ policy_question: true }),
        requestFacts: { ...emptyRequestFacts(), ask: "policy_question" },
      },
    }), "Help with the latest request");

    // One re-prompt for a terminal tool, and no third call planning against
    // everything.
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(toolNamesForCall(1)).not.toContain("create_refund");
    expect(plan.namespaceMiss).toBeUndefined();
    expect(toolNamesForCall(0)).not.toContain("request_wider_tool_set");
  });
});

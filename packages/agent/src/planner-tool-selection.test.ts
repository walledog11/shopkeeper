import { describe, expect, it } from "vitest";
import { emptyIntents, emptyRequestFacts, type ClassifierSignals } from "./classifier-signals.js";
import {
  NAMESPACE_MISS_TOOL_NAME,
  namespaceMissReason,
  selectPlanningTools,
} from "./planner-tool-selection.js";
import { AGENT_TOOLS } from "./tools/registry/index.js";

function signals(
  intents: Partial<ClassifierSignals["intents"]> = {},
): ClassifierSignals {
  return {
    version: 5,
    language: "en",
    intents: { ...emptyIntents(), ...intents },
    requestFacts: emptyRequestFacts(),
  };
}

function select(overrides: Partial<Parameters<typeof selectPlanningTools>[0]> = {}) {
  return selectPlanningTools({
    availableTools: AGENT_TOOLS,
    classifierSignals: signals({ order_status: true }),
    requestSourceMessageId: "message_1",
    latestCustomerMessageId: "message_1",
    operatorMode: false,
    storefrontMode: false,
    merchantAnswerReplan: false,
    ...overrides,
  });
}

function names(selection: ReturnType<typeof select>): string[] {
  return selection.tools.map((tool) => tool.name);
}

describe("selectPlanningTools", () => {
  it.each([
    ["operator", { operatorMode: true }],
    ["storefront_policy", { storefrontMode: true }],
    ["merchant_answer_replan", { merchantAnswerReplan: true }],
    ["no_classifier_signals", { classifierSignals: null }],
    ["classifier_unaligned", { latestCustomerMessageId: "message_2" }],
    ["unclassified_request", { classifierSignals: signals() }],
  ])("keeps the full available registry for %s", (reason, overrides) => {
    const selection = select(overrides);

    expect(selection).toMatchObject({ bucket: "full", reason, narrowed: false });
    expect(names(selection)).toEqual(AGENT_TOOLS.map((tool) => tool.name));
    expect(names(selection)).not.toContain(NAMESPACE_MISS_TOOL_NAME);
  });

  it("narrows order-status plans to order reads plus customer control tools", () => {
    const selection = select();
    const selectedNames = names(selection);

    expect(selection).toMatchObject({ bucket: "order_status", reason: "intent_bucket", narrowed: true });
    expect(selectedNames).toEqual(expect.arrayContaining([
      "find_customer",
      "get_shopify_orders",
      "get_order_by_name",
      "get_order_tracking",
      "send_reply",
      "escalate_to_human",
      "ask_operator",
      NAMESPACE_MISS_TOOL_NAME,
    ]));
    expect(selectedNames).not.toContain("create_refund");
    expect(selectedNames).not.toContain("search_shopify_products");
  });

  it("lets risk classifications fail safely without exposing store mutations", () => {
    const selection = select({
      classifierSignals: signals({ fraud_signals: true, mutative_request: true }),
    });
    const selectedNames = names(selection);

    expect(selection.bucket).toBe("risk");
    expect(selectedNames).toEqual(expect.arrayContaining([
      "send_reply",
      "escalate_to_human",
      "ask_operator",
      NAMESPACE_MISS_TOOL_NAME,
    ]));
    expect(selectedNames).not.toContain("create_refund");
    expect(selectedNames).not.toContain("get_shopify_orders");
  });

  it("keeps every adjacent order action in the coarse mutation bucket", () => {
    const selection = select({
      classifierSignals: signals({ mutative_request: true }),
    });
    const selectedNames = names(selection);

    expect(selection.bucket).toBe("order_mutation");
    expect(selectedNames).toEqual(expect.arrayContaining([
      "update_shopify_order_address",
      "create_refund",
      "create_return",
      "cancel_order",
      "edit_shopify_order",
      "create_exchange",
      "create_gift_card",
      "attach_return_label",
      "get_shopify_orders",
      "send_reply",
    ]));
    expect(selectedNames).not.toContain("create_shopify_order");
    expect(selectedNames).not.toContain("fulfill_order");
  });

  it("unions simultaneous coarse intents", () => {
    const selection = select({
      classifierSignals: signals({ mutative_request: true, policy_question: true }),
    });

    expect(selection.bucket).toBe("order_mutation+policy");
    expect(names(selection)).toEqual(expect.arrayContaining([
      "search_kb",
      "create_return",
      "create_exchange",
      "edit_shopify_order",
      "attach_return_label",
    ]));
  });

  it("does not route on renderer-only request facts", () => {
    const selection = select({
      classifierSignals: {
        ...signals(),
        requestFacts: { ...emptyRequestFacts(), ask: "product_question" },
      },
    });

    expect(selection).toMatchObject({ bucket: "full", reason: "unclassified_request", narrowed: false });
  });

  it("keeps required control tools in every narrowed bucket and reduces serialized schemas", () => {
    const narrowedSignals = [
      signals({ fraud_signals: true }),
      signals({ no_request: true }),
      signals({ policy_question: true }),
      signals({ order_status: true }),
      signals({ mutative_request: true }),
    ];
    const fullChars = JSON.stringify(AGENT_TOOLS).length;

    for (const classifierSignals of narrowedSignals) {
      const selection = select({ classifierSignals });
      const selectedNames = names(selection);
      expect(selection.narrowed).toBe(true);
      expect(selectedNames).toEqual(expect.arrayContaining([
        "send_reply",
        "escalate_to_human",
        "ask_operator",
      ]));
      expect(JSON.stringify(selection.tools).length).toBeLessThan(fullChars);
    }
  });
});

describe("namespaceMissReason", () => {
  it("recognizes empty, incomplete, and explicitly widened plans", () => {
    expect(namespaceMissReason([])).toBe("empty_plan");
    expect(namespaceMissReason([{ name: "get_shopify_orders" }])).toBe("incomplete_plan");
    expect(namespaceMissReason([{ name: NAMESPACE_MISS_TOOL_NAME }])).toBe("model_signal");
    expect(namespaceMissReason([
      { name: "get_shopify_orders" },
      { name: "send_reply" },
    ])).toBeNull();
    expect(namespaceMissReason([{ name: "escalate_to_human" }])).toBeNull();
  });
});

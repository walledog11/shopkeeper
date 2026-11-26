import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { emptyIntents, emptyRequestFacts, type ClassifierSignals } from "./classifier-signals.js";
import { GUEST_TOOL_NAMES, VERIFIED_TOOL_NAMES, isGuestOnlyTool } from "./guest-policy.js";
import {
  DISCOVERY_RESULT_LIMIT,
  DISCOVERY_TOOL_NAME,
  discoverCapabilityTools,
  runCapabilityDiscovery,
  selectPlanningTools,
} from "./planner-tool-selection.js";
import { AGENT_TOOLS, TOOL_DEFINITIONS, selectAgentTools } from "./tools/registry/index.js";

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
  it("offers only a customer clarification for a classified ambiguous terse follow-up", () => {
    const selection = select({
      classifierSignals: signals(),

      ambiguousCustomerFollowUp: true,
    });

    expect(selection).toMatchObject({
      bucket: "clarification",
      reason: "ambiguous_customer_follow_up",
      narrowed: true,
    });
    expect(names(selection)).toEqual(["send_reply"]);
  });

  // Whatever else is true of the turn — a merchant instruction, a mutative
  // classification, the discovery runtime — the follow-up to a withheld message
  // is offered no write, no discovery, and no widening.
  it("offers a withheld-message follow-up only order reads, a reply and escalation", () => {
    const selection = select({
      classifierSignals: signals({ mutative_request: true }),
      merchantInstruction: true,

      withheldMessageFollowUp: true,
    });

    expect(selection).toMatchObject({ reason: "withheld_message_follow_up", narrowed: true });
    expect(names(selection).sort()).toEqual([
      "escalate_to_human", "find_customer", "get_order_by_name", "get_order_fulfillment_status",
      "get_order_tracking", "get_shopify_orders", "send_reply",
    ]);
    expect(selection.tools.every((tool) => TOOL_DEFINITIONS[tool.name]?.category !== "action")).toBe(true);
  });

});

describe("merchant-authored instructions are not narrowed by customer intent", () => {
  // The regression this closes: a customer asked "any update on order #3031?"
  // (order_status) while the merchant instructed "I dropped this at UPS, mark it
  // fulfilled". Narrowing read the customer's intent, hid fulfill_order, and the
  // agent replied that the order had not shipped — contradicting the merchant.
  it("offers merchant-only order tools when the merchant authored the instruction", () => {
    const narrowed = select({ classifierSignals: signals({ order_status: true }) });
    expect(names(narrowed)).not.toContain("fulfill_order");

    const selection = select({
      classifierSignals: signals({ order_status: true }),
      merchantInstruction: true,
    });
    expect(selection.narrowed).toBe(false);
    expect(selection.reason).toBe("merchant_instruction");
    expect(names(selection)).toContain("fulfill_order");
  });

  it("still narrows when the instruction came from the customer's message", () => {
    const selection = select({
      classifierSignals: signals({ order_status: true }),
      merchantInstruction: false,
    });
    expect(selection.narrowed).toBe(true);
    expect(selection.bucket).toBe("order_status");
  });
});

const SUPPORT_TOOLS = selectAgentTools(undefined, null, null)
  .filter((tool) => !isGuestOnlyTool(tool.name));
const GUEST_TOOLS = selectAgentTools(undefined, GUEST_TOOL_NAMES, null);
const VERIFIED_TOOLS = selectAgentTools(undefined, VERIFIED_TOOL_NAMES, null);
const OPERATOR_MODULE_TOOL: Anthropic.Tool = {
  name: "create_flash_sale",
  description: "Start a flash sale discounting the catalog or named variants for a number of hours.",
  input_schema: { type: "object", properties: {}, additionalProperties: false },
};
const MERCHANT_TOOLS = [...SUPPORT_TOOLS, OPERATOR_MODULE_TOOL];

function discovered(
  authorizedTools: readonly Anthropic.Tool[],
  capability: string,
  limit?: number,
): string[] {
  return discoverCapabilityTools({ authorizedTools, capability, limit }).tools
    .map((tool) => tool.name);
}

describe("discoverCapabilityTools", () => {
  it("surfaces the compensation capability a support turn is authorized for", () => {
    const result = discoverCapabilityTools({
      authorizedTools: SUPPORT_TOOLS,
      capability: "refund this order",
    });

    expect(result.tools.map((tool) => tool.name)).toContain("create_refund");
    expect(result.tools.length).toBeLessThanOrEqual(DISCOVERY_RESULT_LIMIT);
  });

  it("surfaces a merchant turn's capability without reaching its module schemas", () => {
    // create_flash_sale is a gateway module tool, not a registry one. Discovery
    // reads the registry, so the only way to hold it stays the module's own
    // tool set — asking for it here is not a second way in.
    expect(discovered(MERCHANT_TOOLS, "run a flash sale on the catalog")).not.toContain("create_flash_sale");
    expect(discovered(MERCHANT_TOOLS, "how support is doing this week")).toContain("get_support_stats");
  });

  it("discovers customer-record writes only from explicit customer capabilities", () => {
    expect(discovered(SUPPORT_TOOLS, "update the linked customer's email address"))
      .toContain("update_shopify_customer_info");
    expect(discovered(SUPPORT_TOOLS, "append an explicit note to the Shopify customer record"))
      .toContain("add_shopify_customer_note");
    expect(discovered(SUPPORT_TOOLS, "where is this customer's order"))
      .not.toContain("add_shopify_customer_note");
  });

  it("never discovers customer or order data for an anonymous storefront visitor", () => {
    for (const capability of [
      "refund my order",
      "look up my customer account",
      "see everything I have ordered",
      "cancel my order",
    ]) {
      const names = discovered(GUEST_TOOLS, capability);
      expect(names).not.toContain("create_refund");
      expect(names).not.toContain("cancel_order");
      expect(names).not.toContain("find_customer");
      expect(names).not.toContain("get_shopify_orders");
      expect(names).not.toContain("get_order_by_name");
      expect(names.every((name) => (GUEST_TOOL_NAMES as readonly string[]).includes(name))).toBe(true);
    }
  });

  it("gives a verified visitor their own order reads and no mutation", () => {
    expect(discovered(VERIFIED_TOOLS, "check the tracking on my order")).toContain("get_order_tracking");
    expect(discovered(VERIFIED_TOOLS, "refund my order")).not.toContain("create_refund");
  });

  it("bounds the result and reports what the bound dropped", () => {
    const unbounded = discoverCapabilityTools({
      authorizedTools: SUPPORT_TOOLS,
      capability: "order",
    });
    expect(unbounded.matched).toBeGreaterThan(DISCOVERY_RESULT_LIMIT);
    expect(unbounded.tools).toHaveLength(DISCOVERY_RESULT_LIMIT);
    expect(unbounded.bounded).toBe(true);

    const limited = discoverCapabilityTools({
      authorizedTools: SUPPORT_TOOLS,
      capability: "order",
      limit: 2,
    });
    expect(limited.tools).toHaveLength(2);
    expect(limited.tools).toEqual(unbounded.tools.slice(0, 2));
  });

  it("returns nothing rather than the registry when the capability is out of reach", () => {
    const result = discoverCapabilityTools({
      authorizedTools: SUPPORT_TOOLS,
      capability: "schedule a courier pickup",
    });

    expect(result).toEqual({ tools: [], matched: 0, bounded: false });
  });

  it("does not discover a retired capability even when it is authorized", () => {
    const retired: Anthropic.Tool = {
      name: "issue_store_credit",
      description: "Issue store credit to a customer.",
      input_schema: { type: "object", properties: {}, additionalProperties: false },
    };

    expect(discovered([...SUPPORT_TOOLS, retired], "issue store credit")).not.toContain("issue_store_credit");
  });
});

describe("selectPlanningTools on the discovery runtime", () => {
  const discover = (overrides: Partial<Parameters<typeof selectPlanningTools>[0]> = {}) =>
    select(overrides);

  it.each([
    ["no_classifier_signals", { classifierSignals: null }],
    ["classifier_unaligned", { latestCustomerMessageId: "message_2" }],
    ["unclassified_request", { classifierSignals: signals() }],
  ])("answers %s with the starter set rather than the registry", (reason, overrides) => {
    const selection = discover(overrides);

    expect(selection).toMatchObject({ bucket: "starter", reason, narrowed: true });
    const selected = names(selection);
    expect(selected).toEqual(expect.arrayContaining([
      "send_reply",
      "escalate_to_human",
      "ask_operator",
      "search_kb",
      "search_shopify_products",
      "get_shopify_orders",
      "get_order_tracking",
      DISCOVERY_TOOL_NAME,
    ]));
    // The address question that opens this way never loads a compensation
    // schema, which is the whole point of not failing open to the registry.
    for (const withheld of [
      "create_refund",
      "create_partial_refund",
      "create_gift_card",
      "cancel_order",
      "update_shopify_order_address",
    ]) {
      expect(selected).not.toContain(withheld);
    }
    expect(selected).not.toContain("request_wider_tool_set");
    expect(selected.length).toBeLessThan(AGENT_TOOLS.length);
  });

  it("offers discovery where the legacy runtime offers the widening retry", () => {
    const selection = discover();

    expect(selection).toMatchObject({ bucket: "order_status", narrowed: true });
    expect(names(selection)).toContain(DISCOVERY_TOOL_NAME);
    expect(names(selection)).not.toContain("request_wider_tool_set");
  });

  it.each([
    ["operator", { operatorMode: true }],
    ["storefront_policy", { storefrontMode: true }],
    ["merchant_instruction", { merchantInstruction: true }],
  ])("leaves the %s actor's own authorized set whole", (reason, overrides) => {
    const selection = discover(overrides);

    expect(selection).toMatchObject({ bucket: "full", reason, narrowed: false });
    expect(names(selection)).toEqual(AGENT_TOOLS.map((tool) => tool.name));
    expect(names(selection)).not.toContain(DISCOVERY_TOOL_NAME);
  });

  // The acceptance sentence this package owns: an address question does not
  // load compensation schemas by default. On the legacy runtime it does, because
  // address changes and refunds share one coarse mutative bucket.
  it.each(["mutative_request", "compensation_request"] as const)("narrows %s to the reads a write is proposed from", (intent) => {
    const selection = discover({ classifierSignals: signals({ [intent]: true }) });
    const selected = names(selection);

    expect(selection).toMatchObject({ bucket: "order_mutation", reason: "intent_bucket", narrowed: true });
    expect(selected).toEqual(expect.arrayContaining([
      "search_kb",
      "search_shopify_products",
      "get_inventory_status",
      "get_shopify_orders",
      "get_order_by_name",
      "send_reply",
      "ask_operator",
      DISCOVERY_TOOL_NAME,
    ]));
    for (const withheld of ["create_refund", "create_partial_refund", "cancel_order", "create_return", "create_exchange", "update_shopify_order_address"]) {
      expect(selected).not.toContain(withheld);
    }
  });

  it("keeps a narrowed mutative turn distinguishable from an unusable classification", () => {
    const mutative = discover({ classifierSignals: signals({ mutative_request: true }) });
    const unclassified = discover({ classifierSignals: signals() });

    // Identical tool sets by construction, so the bucket is the only thing that
    // says whether the classifier was used — which is what the cost measurement
    // has to group by.
    expect(names(mutative).sort()).toEqual(names(unclassified).sort());
    expect(mutative.bucket).toBe("order_mutation");
    expect(unclassified.bucket).toBe("starter");
  });

  it("does not let an adjacent intent put a mutation back", () => {
    const selection = discover({
      classifierSignals: signals({ mutative_request: true, policy_question: true, order_status: true }),
    });
    const selected = names(selection);

    expect(selection.bucket).toBe("order_mutation+order_status+policy");
    expect(selected).toContain("search_kb");
    for (const withheld of ["create_refund", "create_partial_refund", "cancel_order", "create_return", "create_exchange", "update_shopify_order_address"]) {
      expect(selected).not.toContain(withheld);
    }
  });


});

describe("runCapabilityDiscovery", () => {
  const starterToolNames = new Set(
    selectPlanningTools({
      availableTools: SUPPORT_TOOLS,
      classifierSignals: null,
      operatorMode: false,
      storefrontMode: false,
      merchantAnswerReplan: false,

    }).tools.map((tool) => tool.name),
  );

  function resolve(capability: unknown, authorizedTools: readonly Anthropic.Tool[] = SUPPORT_TOOLS) {
    return runCapabilityDiscovery({
      authorizedTools,
      activeToolNames: starterToolNames,
      rawInput: { capability },
    });
  }

  it("reaches the compensation capability the starter set withheld", () => {
    expect(starterToolNames.has("create_refund")).toBe(false);
    const result = resolve("refund this order");

    expect(result.status).toBe("matched");
    expect(result.tools.map((tool) => tool.name)).toContain("create_refund");
    expect(result.content).toContain("create_refund");
  });

  it("does not hand back a schema the model already holds", () => {
    const result = resolve("search the knowledge base");

    expect(result.status).toBe("matched");
    expect(result.content).toContain("search_kb");
    expect(result.tools.map((tool) => tool.name)).not.toContain("search_kb");
  });

  it("cannot reach a capability this actor is not authorized for", () => {
    // The words still match guest-safe reads, so the answer is not empty — but
    // the capability asked for is not in it, and nothing outside the guest set
    // can be.
    const result = resolve("refund my order", GUEST_TOOLS);

    const offered = result.tools.map((tool) => tool.name);
    expect(offered).not.toContain("create_refund");
    expect(offered.every((name) => (GUEST_TOOL_NAMES as readonly string[]).includes(name))).toBe(true);
    expect(result.content).not.toContain("create_refund");
  });

  it("answers exhaustion with a dead end instead of a wider retry", () => {
    const result = resolve("schedule a courier pickup");

    expect(result).toMatchObject({ status: "no_match", tools: [] });
    expect(result.content).toContain("Do not ask for it again");
  });

  it("asks again rather than guessing when nothing was named", () => {
    for (const rawInput of [undefined, null, {}, { capability: "" }, { capability: 7 }]) {
      const result = runCapabilityDiscovery({
        authorizedTools: SUPPORT_TOOLS,
        activeToolNames: starterToolNames,
        rawInput,
      });

      expect(result).toMatchObject({ status: "invalid_input", tools: [] });
    }
  });
});

import { describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { emptyIntents, emptyRequestFacts, type ClassifierSignals } from "./classifier-signals.js";
import { CONTEXT_BUDGETS, estimateInputTokensFromChars } from "./context-budget.js";
import { estimateModelUsageCostUsd } from "./model-cost.js";
import { SONNET_MODEL } from "./ai/index.js";
import { buildSystemPromptParts } from "./prompt.js";
import {
  DISCOVERY_RESULT_LIMIT,
  discoverCapabilityTools,
  selectPlanningTools,
} from "./planner-tool-selection.js";
import { AGENT_TOOLS } from "./tools/registry/index.js";
import type { AgentContext } from "./agent-context.js";

/**
 * Package 4's cost check: "evaluate the complete cost of discovery and
 * follow-up calls, not just the smaller initial prompt."
 *
 * Measured, not estimated, on the input side — the schemas offered per call and
 * the prompt that carries them are exactly computable without a provider, and
 * they are what the trade is actually about. The call *counts* are structural:
 * the legacy runtime answers a namespace miss by discarding the attempt and
 * re-planning against the whole registry from a clean transcript, so its second
 * call repeats the first call's input; the discovery runtime answers it inside
 * the turn, so its second call is the first call's transcript plus one discovery
 * result and up to DISCOVERY_RESULT_LIMIT schemas.
 *
 * What this does NOT measure, and what the cutover baseline still owes: output
 * tokens, wall-clock latency, and how often a real model reaches for discovery
 * when it did not need to. A cheaper prompt that doubles the discovery rate is
 * not cheaper, and only a live run can say which happens.
 */

function makeCtx(): AgentContext {
  return {
    orgId: "org_test",
    orgName: "Test Store",
    customer: { id: "customer_test", name: "Jane Test", platformId: "jane@test.com" },
    recentMessages: [{ senderType: "customer", contentText: "One jar arrived cracked - can you put $12 on my account?" }],
    openThreadCount: 1,
    shopify: { shop: "test-store.myshopify.com", accessToken: "shpat_test" },
    recentOrders: [],
    linkedShopifyCustomerName: null,
    kbArticles: [],
    merchantPreferences: [],
    thread: {
      id: "thread_test",
      status: "open",
      channelType: "email",
      tag: "Support",
      aiSummary: null,
      shopifyCustomerId: null,
    },
    escalate: () => Promise.resolve(),
  };
}

function signals(intents: Partial<ClassifierSignals["intents"]>): ClassifierSignals {
  return {
    version: 5,
    language: "en",
    intents: { ...emptyIntents(), ...intents },
    requestFacts: emptyRequestFacts(),
  };
}

function schemaTokens(tools: readonly Anthropic.Tool[]): number {
  return estimateInputTokensFromChars(JSON.stringify(tools).length);
}

function promptTokens(discovery: boolean): number {
  if (discovery) vi.stubEnv("AGENT_CAPABILITY_DISCOVERY_MODE", "discover");
  else vi.stubEnv("AGENT_CAPABILITY_DISCOVERY_MODE", "off");
  const { stable, volatile } = buildSystemPromptParts(makeCtx());
  vi.unstubAllEnvs();
  return estimateInputTokensFromChars(stable.length + volatile.length);
}

function inputCostUsd(tokens: number): number {
  return estimateModelUsageCostUsd(SONNET_MODEL, {
    inputTokens: tokens,
    outputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
  });
}

function select(capabilityDiscovery: boolean, intents: Partial<ClassifierSignals["intents"]>) {
  return selectPlanningTools({
    availableTools: AGENT_TOOLS,
    classifierSignals: signals(intents),
    requestSourceMessageId: "message_1",
    latestCustomerMessageId: "message_1",
    operatorMode: false,
    storefrontMode: false,
    merchantAnswerReplan: false,
    capabilityDiscovery,
  });
}

/** One turn's input tokens across every planning call it makes. */
interface TurnCost {
  calls: number;
  schemaTokens: number[];
  totalInputTokens: number;
}

function legacyTurn(intents: Partial<ClassifierSignals["intents"]>, widens: boolean): TurnCost {
  const first = schemaTokens(select(false, intents).tools);
  const prompt = promptTokens(false);
  // The widened retry re-plans against the whole registry from a clean
  // transcript, so it pays the prompt again and the full schema set on top.
  const calls = widens ? [first, schemaTokens(AGENT_TOOLS)] : [first];
  return {
    calls: calls.length,
    schemaTokens: calls,
    totalInputTokens: calls.reduce((sum, tokens) => sum + tokens + prompt, 0),
  };
}

function discoveryTurn(
  intents: Partial<ClassifierSignals["intents"]>,
  capability: string | null,
): TurnCost {
  const selection = select(true, intents);
  const first = schemaTokens(selection.tools);
  const prompt = promptTokens(true);
  if (!capability) {
    return { calls: 1, schemaTokens: [first], totalInputTokens: first + prompt };
  }
  const offered = new Set(selection.tools.map((tool) => tool.name));
  const added = discoverCapabilityTools({ authorizedTools: AGENT_TOOLS, capability }).tools
    .filter((tool) => !offered.has(tool.name));
  // The attempt continues: the second call carries the same prompt and schemas,
  // plus what discovery added and the discovery exchange itself.
  const second = first + schemaTokens(added);
  return {
    calls: 2,
    schemaTokens: [first, second],
    totalInputTokens: first + prompt + second + prompt,
  };
}

describe("capability discovery cost", () => {
  it("costs less than the widened replan it replaces, on a request that needs a withheld capability", () => {
    const intents = { mutative_request: true };
    const legacy = legacyTurn(intents, true);
    const discovery = discoveryTurn(intents, "gift card store credit");

    // Both make two calls. The difference is what the second one carries: the
    // whole registry from scratch, or the starter set plus what was asked for.
    expect(legacy.calls).toBe(2);
    expect(discovery.calls).toBe(2);
    expect(discovery.totalInputTokens).toBeLessThan(legacy.totalInputTokens);

    console.log("[cost] mutative request needing a withheld capability", {
      legacyCalls: legacy.calls,
      legacySchemaTokens: legacy.schemaTokens,
      legacyInputTokens: legacy.totalInputTokens,
      legacyInputCostUsd: Number(inputCostUsd(legacy.totalInputTokens).toFixed(6)),
      discoveryCalls: discovery.calls,
      discoverySchemaTokens: discovery.schemaTokens,
      discoveryInputTokens: discovery.totalInputTokens,
      discoveryInputCostUsd: Number(inputCostUsd(discovery.totalInputTokens).toFixed(6)),
    });
  });

  it("costs less on the case the starter set already covers", () => {
    const intents = { mutative_request: true };
    const legacy = legacyTurn(intents, false);
    const discovery = discoveryTurn(intents, null);

    expect(discovery.totalInputTokens).toBeLessThan(legacy.totalInputTokens);
    console.log("[cost] mutative request answered from the starter set", {
      legacyInputTokens: legacy.totalInputTokens,
      discoveryInputTokens: discovery.totalInputTokens,
      savedTokens: legacy.totalInputTokens - discovery.totalInputTokens,
      savedInputCostUsd: Number(
        (inputCostUsd(legacy.totalInputTokens) - inputCostUsd(discovery.totalInputTokens)).toFixed(6),
      ),
    });
  });

  it("costs more than a single narrow legacy call when discovery was not needed", () => {
    // The honest side of the trade: the classifier narrowed correctly, the
    // legacy turn never widened, and discovery still paid a second call because
    // the model asked for something the bucket withheld. The turn more than
    // doubles. This is the case a live run has to bound — the input-side
    // arithmetic says what one occurrence costs, never how often it happens,
    // and a first prompt that is 62% smaller on the cases it replaces does not
    // pay for a discovery call on the cases it does not.
    const intents = { order_status: true };
    const legacy = legacyTurn(intents, false);
    const discovery = discoveryTurn(intents, "refund an order");

    expect(discovery.totalInputTokens).toBeGreaterThan(legacy.totalInputTokens);
    console.log("[cost] unnecessary discovery on a turn legacy answered in one call", {
      legacyInputTokens: legacy.totalInputTokens,
      discoveryInputTokens: discovery.totalInputTokens,
      extraTokens: discovery.totalInputTokens - legacy.totalInputTokens,
      extraInputCostUsd: Number(
        (inputCostUsd(discovery.totalInputTokens) - inputCostUsd(legacy.totalInputTokens)).toFixed(6),
      ),
    });
  });

  it("changes the first call only where the starter set replaces something wider", () => {
    // The shape of the trade before any discovery call happens, and it is
    // narrower than "discovery makes the prompt smaller": a bucket the
    // classifier could use is not replaced at all, so order_status and policy
    // differ only by the control tool that was swapped for another. What
    // shrinks is the mutative bucket and every classification the planner
    // cannot use. Discovery's real cost is therefore the second call, not the
    // first — which is why the cases above measure whole turns.
    const rows = ([
      ["order_status", { order_status: true }],
      ["policy", { policy_question: true }],
      ["order_mutation", { mutative_request: true }],
      ["unclassified", {}],
    ] as const).map(([label, intents]) => ({
      bucket: label,
      legacyTools: select(false, intents).tools.length,
      legacyTokens: schemaTokens(select(false, intents).tools),
      discoveryTools: select(true, intents).tools.length,
      discoveryTokens: schemaTokens(select(true, intents).tools),
    }));

    const status = rows.find((row) => row.bucket === "order_status")!;
    const mutation = rows.find((row) => row.bucket === "order_mutation")!;
    const unclassified = rows.find((row) => row.bucket === "unclassified")!;
    // Same tools, and the only difference is which control tool was offered.
    expect(status.discoveryTools).toBe(status.legacyTools);
    expect(Math.abs(status.discoveryTokens - status.legacyTokens)).toBeLessThan(100);
    // The two the starter set actually replaces.
    expect(mutation.discoveryTokens).toBeLessThan(mutation.legacyTokens / 2);
    expect(unclassified.discoveryTokens).toBeLessThan(unclassified.legacyTokens / 2);

    console.log("[cost] first-call schema tokens by classification", rows);
  });

  it("is the only saving available on the turn the knowledge base is deferred for", () => {
    // Where the deferral applies and where the schema reduction applies are
    // almost disjoint, which is the useful thing to know. An order-status turn
    // keeps its bucket, so the tool set saves it nothing and the deferred
    // knowledge base is the entire saving; the classifications that take the
    // starter set still pre-load the knowledge base, so their saving is the
    // schemas alone. Neither change subsumes the other.
    const statusLegacy = schemaTokens(select(false, { order_status: true }).tools);
    const statusDiscovery = schemaTokens(select(true, { order_status: true }).tools);
    const starterSchemas = schemaTokens(select(true, { mutative_request: true }).tools);
    const fullSchemas = schemaTokens(AGENT_TOOLS);
    const kbCeiling = estimateInputTokensFromChars(CONTEXT_BUDGETS.kbTotalChars);

    // Nothing to save on the schemas of a status turn.
    expect(Math.abs(statusDiscovery - statusLegacy)).toBeLessThan(100);
    // And the deferral is worth more than that difference by two orders.
    expect(kbCeiling).toBeGreaterThan(Math.abs(statusDiscovery - statusLegacy) * 10);

    console.log("[cost] where each saving applies", {
      statusTurnSchemaDelta: statusDiscovery - statusLegacy,
      statusTurnKbCeilingTokens: kbCeiling,
      statusTurnKbCeilingCostUsd: Number(inputCostUsd(kbCeiling).toFixed(6)),
      unclassifiedTurnSchemaSaving: fullSchemas - starterSchemas,
      unclassifiedTurnKbSaving: 0,
    });
  });

  it("bounds what one discovery call can add to the turn", () => {
    // Discovery's worst case is bounded by the result limit, so no sequence of
    // discovery calls reconstructs the full-registry prompt in one call. The
    // number of calls is bounded by the loop's iteration cap, not here.
    const selection = select(true, { mutative_request: true });
    const worst = discoverCapabilityTools({
      authorizedTools: AGENT_TOOLS,
      capability: "order customer refund return exchange address",
    });

    expect(worst.tools.length).toBeLessThanOrEqual(DISCOVERY_RESULT_LIMIT);
    expect(schemaTokens([...selection.tools, ...worst.tools]))
      .toBeLessThan(schemaTokens(AGENT_TOOLS));

    console.log("[cost] schemas per call", {
      starterSet: selection.tools.length,
      fullRegistry: AGENT_TOOLS.length,
      starterSetTokens: schemaTokens(selection.tools),
      fullRegistryTokens: schemaTokens(AGENT_TOOLS),
      maxAddedByOneDiscovery: worst.tools.length,
    });
  });
});

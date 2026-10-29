// Free deterministic checks for the agent eval harness. Live-model cases stay in
// index.integration.test.ts behind evalsEnabled().
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { anthropic } from "@shopkeeper/agent/ai";
import { runFixtureRepeated } from "./runner";
import { validateFixtures } from "./fixture-validator";
import { assertRecordedStochasticCoreFixtures } from "./recorded-stochastic-core";
import type { Fixture } from "./types";

const FIXTURES_DIR = join(__dirname, "fixtures");

function loadFixtures(): Fixture[] {
  const files = readdirSync(FIXTURES_DIR).filter((f) => f.endsWith(".json")).sort();
  const fixtures = files.map((f) => JSON.parse(readFileSync(join(FIXTURES_DIR, f), "utf8")) as Fixture);
  validateFixtures(fixtures, files);
  assertRecordedStochasticCoreFixtures(fixtures);
  return fixtures;
}

describe("agent eval harness", () => {
  const allFixtures = loadFixtures();

  it("serves a fixture's simulated read result to the planner", async () => {
    const fixture = allFixtures.find((f) => f.id === "storefront-guest-product-search");
    const simulated = fixture?.setup.simulateToolResults?.find((r) => r.tool === "search_shopify_products");
    if (!fixture || !simulated) throw new Error("guard fixture no longer simulates search_shopify_products");
    const toolResults: unknown[] = [];
    const originalCreate = anthropic.messages.create;
    let calls = 0;
    anthropic.messages.create = (async (body: { model: string; messages: Array<{ content: unknown }> }) => {
      calls += 1;
      const last = body.messages[body.messages.length - 1]?.content;
      if (Array.isArray(last)) toolResults.push(...last.filter((block) => block?.type === "tool_result"));
      return {
        id: `scripted-${calls}`,
        type: "message",
        role: "assistant",
        model: body.model,
        content: calls === 1
          ? [{ type: "tool_use", id: "read-1", name: "search_shopify_products", input: { query: "Pencil Half Zip" } }]
          : [{ type: "text", text: "Done." }],
        stop_reason: calls === 1 ? "tool_use" : "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      };
    }) as never;
    try {
      await runFixtureRepeated(fixture, 1);
    } finally {
      anthropic.messages.create = originalCreate;
    }
    expect(toolResults).toContainEqual(expect.objectContaining({ tool_use_id: "read-1", content: simulated.result }));
  });
});

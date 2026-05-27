import { describe, it, expect, beforeEach } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { allowTestNetworkHosts } from "../../../../../../scripts/test-network-guard.mjs";
import { runFixture } from "./runner";
import type { Fixture } from "./types";

const FIXTURES_DIR = join(__dirname, "fixtures");

function loadFixtures(): Fixture[] {
  const files = readdirSync(FIXTURES_DIR).filter((f) => f.endsWith(".json"));
  return files.map((f) => JSON.parse(readFileSync(join(FIXTURES_DIR, f), "utf8")) as Fixture);
}

const hasRealKey =
  typeof process.env.ANTHROPIC_API_KEY === "string" &&
  process.env.ANTHROPIC_API_KEY.length > 0 &&
  process.env.ANTHROPIC_API_KEY !== "test-anthropic-key";
const ANTHROPIC_API_HOST = "api.anthropic.com";

describe("agent evals", () => {
  if (!hasRealKey) {
    it.skip("requires ANTHROPIC_API_KEY to be set to a real key", () => {});
    return;
  }

  beforeEach(() => {
    allowTestNetworkHosts(ANTHROPIC_API_HOST);
  });

  const fixtures = loadFixtures();

  for (const fixture of fixtures) {
    it(
      `${fixture.id} — ${fixture.description}`,
      async () => {
        const result = await runFixture(fixture);
        console.log(
          `[eval] ${result.id} pass=${result.pass} latency=${result.latencyMs}ms calls=${result.usage.modelCalls} in=${result.usage.inputTokens} out=${result.usage.outputTokens} cacheRead=${result.usage.cacheReadInputTokens} judge[in=${result.usage.judgeUsage.inputTokens} out=${result.usage.judgeUsage.outputTokens} cacheRead=${result.usage.judgeUsage.cacheReadInputTokens}]`,
        );
        if (!result.pass) {
          for (const f of result.failures) {
            console.log(`  - ${f}`);
          }
        }
        expect(result.failures).toEqual([]);
      },
      60_000,
    );
  }

  it(
    "prompt caching: second run of the pilot fixture reads from cache",
    async () => {
      const pilot = fixtures.find((f) => f.id === "order-status-basic");
      if (!pilot) throw new Error("pilot fixture 'order-status-basic' not found");
      const first = await runFixture(pilot);
      const second = await runFixture(pilot);
      console.log(
        `[eval:cache] first cacheCreation=${first.usage.cacheCreationInputTokens} cacheRead=${first.usage.cacheReadInputTokens}; second cacheCreation=${second.usage.cacheCreationInputTokens} cacheRead=${second.usage.cacheReadInputTokens}`,
      );
      expect(second.usage.cacheReadInputTokens).toBeGreaterThan(0);
    },
    120_000,
  );
});

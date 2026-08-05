// Agent evals: plan-shape suite (always-on, gated by ANTHROPIC_API_KEY) + optional
// LLM-judge rubrics (Layer 2). The judge fires only for fixtures with `expectedRubric`
// that draft a non-empty reply, and only when judging is enabled.
//
// Judge gating (see runner.ts:isJudgeEnabled): defaults to ON locally and OFF in CI
// (when `process.env.CI` is set). Override with `RUN_JUDGE_EVALS`:
//   RUN_JUDGE_EVALS=1     → force-enable (e.g. nightly / scheduled CI runs)
//   RUN_JUDGE_EVALS=0     → force-disable
// Skipping keeps per-push spend in check — each judged fixture adds a Sonnet call.
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { allowTestNetworkHosts } from "../../../../../../scripts/test-network-guard.mjs";
import {
  runFixtureRepeated,
  probeSystemPromptCacheRead,
  summarizeResults,
  summarizeGates,
  formatSummary,
  formatGateSummary,
  formatUsageBreakdown,
  formatUsageDelta,
  shouldUpdateBaseline,
  writeBaseline,
  loadBaseline,
  compareToBaseline,
  regressionThreshold,
  evalRepeats,
} from "./runner";
import type { Fixture, FixtureRunSummary } from "./types";
import { validateFixtures } from "./fixture-validator";

const FIXTURES_DIR = join(__dirname, "fixtures");

function loadFixtures(): Fixture[] {
  const files = readdirSync(FIXTURES_DIR).filter((f) => f.endsWith(".json")).sort();
  const fixtures = files.map((f) => JSON.parse(readFileSync(join(FIXTURES_DIR, f), "utf8")) as Fixture);
  validateFixtures(fixtures, files);
  return fixtures;
}

function requestedSuite(): "core" | "full" {
  const value = process.env.EVAL_SUITE?.trim().toLowerCase() ?? "full";
  if (value !== "core" && value !== "full") throw new Error(`Invalid EVAL_SUITE ${JSON.stringify(value)}`);
  return value;
}

const hasRealKey =
  typeof process.env.ANTHROPIC_API_KEY === "string" &&
  process.env.ANTHROPIC_API_KEY.length > 0 &&
  process.env.ANTHROPIC_API_KEY !== "test-anthropic-key";
const ANTHROPIC_API_HOST = "api.anthropic.com";

describe.sequential("agent evals", () => {
  const suite = requestedSuite();
  const allFixtures = loadFixtures();
  const fixtures = suite === "core"
    ? allFixtures.filter(fixture => fixture.suite === "core")
    : allFixtures;
  if (fixtures.length === 0) {
    it("executes at least one fixture", () => {
      throw new Error(`EVAL_SUITE=${suite} selected zero fixtures`);
    });
    return;
  }

  if (!hasRealKey) {
    const requireKey = process.env.CI || process.env.REQUIRE_MODEL_EVALS === "1";
    (requireKey ? it : it.skip)("requires ANTHROPIC_API_KEY to be set to a real key", () => {
      if (requireKey) throw new Error("ANTHROPIC_API_KEY must be a real key; skipped model suites cannot pass CI");
    });
    return;
  }

  beforeEach(() => {
    allowTestNetworkHosts(ANTHROPIC_API_HOST);
  });

  const repeats = evalRepeats();
  const collected: FixtureRunSummary[] = [];

  for (const fixture of fixtures) {
    it(
      `${fixture.id} — ${fixture.description}`,
      async () => {
        let summary = await runFixtureRepeated(fixture, repeats);
        if (suite === "core" && !fixture.advisory && summary.passes !== summary.repeats) {
          const retries = await runFixtureRepeated(fixture, 2);
          summary = {
            id: fixture.id,
            repeats: retries.repeats,
            passes: retries.passes,
            passRate: retries.passRate,
            results: retries.results,
          };
        }
        collected.push(summary);
        // In update mode, persist after each fixture so an interrupted capture keeps
        // what already ran instead of losing everything when the final afterAll never fires.
        if (shouldUpdateBaseline()) writeBaseline(summarizeResults(collected));
        const last = summary.results[summary.results.length - 1];
        console.log(
          `[eval] ${summary.id} passRate=${summary.passes}/${summary.repeats} latency=${last.latencyMs}ms calls=${last.usage.modelCalls} in=${last.usage.inputTokens} out=${last.usage.outputTokens} cacheRead=${last.usage.cacheReadInputTokens} judge[in=${last.usage.judgeUsage.inputTokens} out=${last.usage.judgeUsage.outputTokens} cacheRead=${last.usage.judgeUsage.cacheReadInputTokens}]`,
        );
        for (const f of summary.results.find((r) => !r.pass)?.failures ?? []) {
          console.log(`  - ${f}`);
        }
        // A fixture that fails every repeat is hard-broken — fail the test. Flappy fixtures
        // (some repeats pass) clear this bar; their pass-rate is recorded and gated against
        // the baseline in afterAll. At repeats=1 this is identical to requiring the run to pass.
        // Advisory fixtures are exempt: their pass-rate is still recorded (and baseline-gated),
        // but a 0/N draw does not red CI — the property they probe is model judgment, not a
        // safety gate. See Fixture.advisory.
        if (fixture.advisory && suite === "full") {
          if (summary.passes === 0) {
            console.log(`  ~ advisory ${summary.id}: 0/${summary.repeats} (not gated)`);
          }
        } else {
          expect(summary.passes).toBe(summary.repeats);
        }
      },
      // Generous: a multi-iteration agent run can take >60s under rate-limit backoff, and we
      // now run it `repeats` times back-to-back. A timed-out fixture keeps running and its
      // restore would clobber the next one's instrumentation on the shared client, so we avoid
      // abandoning runs mid-flight.
      // Provider backoff can dominate a healthy repeated run. The 2026-07-28
      // committed cadence produced a passing 3/3 fixture in 943s, beyond the
      // previous 540s allowance, so keep enough headroom to avoid reporting a
      // model-quality regression when every repeat actually completed.
      360_000 * repeats,
    );
  }

  afterAll(() => {
    if (collected.length === 0) return;
    const summary = summarizeResults(collected);
    console.log(formatGateSummary(summarizeGates(collected, fixtures)));
    console.log(formatSummary(summary));
    console.log(formatUsageBreakdown(collected));

    if (shouldUpdateBaseline()) {
      writeBaseline(summary);
      console.log("[eval:baseline] wrote baseline.json");
      return;
    }

    if (suite === "core") return;

    const baseline = loadBaseline();
    if (!baseline) {
      console.log(
        "[eval:baseline] no committed baseline; skipping regression gate. Run with UPDATE_EVAL_BASELINE=1 to create one.",
      );
      return;
    }

    // Cost movement, reported but never gated: a tuning change is allowed to
    // cost more if it scores better, and that call is the merchant's, not CI's.
    if (summary.usage && baseline.usage) {
      console.log(formatUsageDelta(summary.usage, baseline.usage));
    }

    const threshold = regressionThreshold();
    const { aggregate, categories, fixtures: fixtureRegressions } = compareToBaseline(summary, baseline, threshold);
    for (const msg of [...categories, ...fixtureRegressions]) {
      console.log(`[eval:baseline] WARN ${msg}`);
    }
    if (aggregate) {
      throw new Error(`[eval:baseline] regression: ${aggregate}`);
    }
  });

  it(
    "prompt caching: an identical cached system prompt reads from cache on repeat",
    async () => {
      const cache = await probeSystemPromptCacheRead();
      console.log(
        `[eval:cache] first cacheCreation=${cache.firstCreate} cacheRead=${cache.firstRead}; second cacheCreation=${cache.secondCreate} cacheRead=${cache.secondRead}`,
      );
      expect(cache.secondRead).toBeGreaterThan(0);
    },
    120_000,
  );
});

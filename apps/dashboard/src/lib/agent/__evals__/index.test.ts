// Agent evals: plan-shape suite (paid, gated by evalsEnabled) + optional LLM-judge
// rubrics. Free harness checks live in harness.integration.test.ts.
//
// Judge gating (see runner.ts:isJudgeEnabled): defaults to ON locally and OFF in CI
// (when `process.env.CI` is set). Override with `RUN_JUDGE_EVALS`:
//   RUN_JUDGE_EVALS=1     → force-enable (e.g. scheduled CI runs)
//   RUN_JUDGE_EVALS=0     → force-disable
//   EVAL_FIXTURE=id[,id]  → run only named fixtures
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { appendFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { allowTestNetworkHosts } from "../../../../../../scripts/test-network-guard.mjs";
import { modelSpendBudgetFromEnv } from "@shopkeeper/agent/model-cost";
import {
  runFixtureRepeated,
  probeSystemPromptCacheRead,
  summarizeResults,
  summarizeGates,
  formatSummary,
  formatGateSummary,
  formatModelUsageBreakdown,
  formatTaskSummary,
  formatUsageBreakdown,
  evalRepeats,
  hardFailureConfirmations,
} from "./runner";
import type { Fixture, FixtureRunSummary } from "./types";
import { validateFixtures } from "./fixture-validator";
import { assertRecordedStochasticCoreFixtures } from "./recorded-stochastic-core";
import { readCachedPassingSummary, writePassingSummary } from "./result-cache";
import {
  evalsEnabled,
  requestedEvalSuite,
  requestedFixtureIds,
  selectFixtures,
} from "./selection";

const FIXTURES_DIR = join(__dirname, "fixtures");
const EVAL_REPORT_PATH = join(__dirname, "../../../../../../test-results/eval-report.log");

function writeEvalReportLine(line: string): void {
  console.log(line);
  appendFileSync(EVAL_REPORT_PATH, `${line}\n`);
}

function loadFixtures(): Fixture[] {
  const files = readdirSync(FIXTURES_DIR).filter((f) => f.endsWith(".json")).sort();
  const fixtures = files.map((f) => JSON.parse(readFileSync(join(FIXTURES_DIR, f), "utf8")) as Fixture);
  validateFixtures(fixtures, files);
  assertRecordedStochasticCoreFixtures(fixtures);
  return fixtures;
}

const hasRealKey =
  typeof process.env.ANTHROPIC_API_KEY === "string" &&
  process.env.ANTHROPIC_API_KEY.length > 0 &&
  process.env.ANTHROPIC_API_KEY !== "test-anthropic-key";
const ANTHROPIC_API_HOST = "api.anthropic.com";

describe.sequential("agent evals", () => {
  const suite = requestedEvalSuite();
  const requestedIds = requestedFixtureIds();
  const allFixtures = loadFixtures();
  const fixtures = selectFixtures(allFixtures, suite, requestedIds);
  if (fixtures.length === 0) {
    it("executes at least one fixture", () => {
      throw new Error(`EVAL_SUITE=${suite} selected zero fixtures`);
    });
    return;
  }

  if (!evalsEnabled()) {
    it.skip("live-model evals (set EVAL_RUN=1, or use npm run test:evals)", () => {});
    return;
  }

  if (!hasRealKey) {
    const requireKey = process.env.REQUIRE_MODEL_EVALS === "1";
    (requireKey ? it : it.skip)("requires ANTHROPIC_API_KEY to be set to a real key", () => {
      if (requireKey) throw new Error("ANTHROPIC_API_KEY must be a real key; skipped model suites cannot pass CI");
    });
    return;
  }

  beforeEach(() => {
    allowTestNetworkHosts(ANTHROPIC_API_HOST);
  });

  mkdirSync(dirname(EVAL_REPORT_PATH), { recursive: true });
  writeFileSync(EVAL_REPORT_PATH, "");

  const repeats = evalRepeats();
  const confirmations = hardFailureConfirmations();
  const budget = modelSpendBudgetFromEnv();
  if (process.env.REQUIRE_MODEL_EVALS === "1" && !budget) {
    throw new Error("Paid eval workflows must set EVAL_MAX_USD and EVAL_MAX_MODEL_CALLS");
  }
  const collected: FixtureRunSummary[] = [];
  const executed: FixtureRunSummary[] = [];

  for (const fixture of fixtures) {
    it(
      `${fixture.id} — ${fixture.description}`,
      async () => {
        const cached = readCachedPassingSummary(fixture, repeats);
        if (cached) {
          collected.push(cached);
          writeEvalReportLine(`[eval] ${fixture.id} reused exact-commit passing evidence ${cached.passes}/${cached.repeats}`);
          return;
        }

        let summary = await runFixtureRepeated(fixture, repeats, budget);
        executed.push(summary);
        const retryableModelFailure = summary.results.every(
          result => result.pass || result.failureKind === "model_behavior",
        );
        if (
          confirmations > 0
          && !fixture.advisory
          && summary.passes !== summary.repeats
          && retryableModelFailure
        ) {
          const retries = await runFixtureRepeated(fixture, confirmations, budget);
          executed.push(retries);
          summary = {
            id: fixture.id,
            repeats: retries.repeats,
            passes: retries.passes,
            passRate: retries.passRate,
            results: retries.results,
          };
        }
        const brokenResult = summary.results.find(
          result => result.failureKind === "infrastructure" || result.failureKind === "budget",
        );
        if (brokenResult) {
          throw new Error(
            `${summary.id}: ${brokenResult.failureKind} failure, not a model result — `
            + `${brokenResult.failures[0] ?? "no detail"}`,
          );
        }
        collected.push(summary);
        writePassingSummary(fixture, repeats, summary);
        const last = summary.results[summary.results.length - 1];
        const plannerIterations = summary.results.map(result => result.usage.plannerModelCalls).join(",");
        writeEvalReportLine(
          `[eval] ${summary.id} passRate=${summary.passes}/${summary.repeats} latency=${last.latencyMs}ms cost=$${last.usage.taskCostUsd.toFixed(4)} calls=${last.usage.modelCalls} discovery=${last.usage.discoveryCalls} plannerIterations=[${plannerIterations}] in=${last.usage.inputTokens} out=${last.usage.outputTokens} cacheRead=${last.usage.cacheReadInputTokens} judge[in=${last.usage.judgeUsage.inputTokens} out=${last.usage.judgeUsage.outputTokens} cacheRead=${last.usage.judgeUsage.cacheReadInputTokens}]`,
        );
        for (const f of summary.results.find((r) => !r.pass)?.failures ?? []) {
          writeEvalReportLine(`  - ${f}`);
        }
        if (fixture.advisory && suite === "full") {
          if (summary.passes === 0) {
            writeEvalReportLine(`  ~ advisory ${summary.id}: 0/${summary.repeats} (not gated)`);
          }
        } else if (fixture.stochasticRelease) {
          if (summary.passes !== summary.repeats) {
            writeEvalReportLine(
              `  ~ stochastic ${summary.id}: ${summary.passes}/${summary.repeats} (recorded core; not hard-gated)`,
            );
          }
        } else {
          expect(summary.passes).toBe(summary.repeats);
        }
      },
      360_000 * repeats,
    );
  }

  afterAll(() => {
    if (collected.length === 0) return;
    const summary = summarizeResults(collected);
    writeEvalReportLine(formatGateSummary(summarizeGates(collected, fixtures)));
    writeEvalReportLine(formatSummary(summary));
    writeEvalReportLine(formatTaskSummary(executed));
    writeEvalReportLine(formatUsageBreakdown(executed));
    writeEvalReportLine(formatModelUsageBreakdown(executed));
    if (budget) {
      const spend = budget.snapshot();
      writeEvalReportLine(
        `[eval:budget] spent=$${spend.spentUsd.toFixed(4)}/$${spend.maxUsd.toFixed(2)} calls=${spend.calls}/${spend.maxCalls}`,
      );
      budget.assertWithinLimit();
    }
  });

  if (!requestedIds && process.env.EVAL_CACHE_PROBE === "1") {
    it(
      "prompt caching: an identical cached system prompt reads from cache on repeat",
      async () => {
        const cache = await probeSystemPromptCacheRead();
        writeEvalReportLine(
          `[eval:cache] first cacheCreation=${cache.firstCreate} cacheRead=${cache.firstRead}; second cacheCreation=${cache.secondCreate} cacheRead=${cache.secondRead}`,
        );
        expect(cache.secondRead).toBeGreaterThan(0);
      },
      120_000,
    );
  }
});

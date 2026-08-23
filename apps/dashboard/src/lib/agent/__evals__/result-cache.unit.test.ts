import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { readCachedPassingSummary, writePassingSummary } from "./result-cache"
import type { Fixture, FixtureRunSummary } from "./types"

const fixture: Fixture = {
  id: "cache-test",
  description: "cache test",
  suite: "core",
  setup: { channelType: "email", messages: [] },
  instruction: "test",
  expectedPlan: {},
}

const passing: FixtureRunSummary = {
  id: fixture.id,
  repeats: 1,
  passes: 1,
  passRate: 1,
  results: [{
    id: fixture.id,
    pass: true,
    failureKind: "none",
    failures: [],
    latencyMs: 1,
    usage: {
      modelCalls: 1,
      plannerModelCalls: 1,
      models: {},
      inputTokens: 1,
      outputTokens: 1,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
      plannerUsage: { inputTokens: 1, outputTokens: 1, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 },
      runUsage: { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 },
      judgeUsage: { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 },
    },
  }],
}

let directory: string | null = null

afterEach(() => {
  delete process.env.EVAL_RESULT_CACHE_DIR
  if (directory) rmSync(directory, { recursive: true, force: true })
  directory = null
})

describe("exact-SHA eval result cache", () => {
  it("reuses only complete passing evidence for the same repeat count", () => {
    directory = mkdtempSync(join(tmpdir(), "shopkeeper-eval-cache-"))
    process.env.EVAL_RESULT_CACHE_DIR = directory
    writePassingSummary(fixture, 1, passing)
    expect(readCachedPassingSummary(fixture, 1)).toEqual(passing)
    expect(readCachedPassingSummary(fixture, 2)).toBeNull()
  })

  it("does not persist a failed result", () => {
    directory = mkdtempSync(join(tmpdir(), "shopkeeper-eval-cache-"))
    process.env.EVAL_RESULT_CACHE_DIR = directory
    writePassingSummary(fixture, 1, { ...passing, passes: 0, passRate: 0 })
    expect(readCachedPassingSummary(fixture, 1)).toBeNull()
  })
})

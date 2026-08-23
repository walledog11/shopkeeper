import { describe, expect, it } from "vitest"
import {
  estimateModelUsageCostUsd,
  ModelSpendBudget,
  ModelSpendBudgetExceededError,
  modelSpendBudgetFromEnv,
  UnknownModelPriceError,
} from "./model-cost.js"

const usage = {
  inputTokens: 1_000_000,
  outputTokens: 100_000,
  cacheReadInputTokens: 2_000_000,
  cacheCreationInputTokens: 200_000,
  budgetTokens: 0,
}

describe("model API cost accounting", () => {
  it("prices input, output, and prompt-cache tokens by model", () => {
    expect(estimateModelUsageCostUsd("claude-sonnet-5", usage)).toBeCloseTo(4.2)
    expect(estimateModelUsageCostUsd("claude-sonnet-4-6", usage)).toBeCloseTo(6.3)
    expect(estimateModelUsageCostUsd("claude-haiku-4-5-20251001", usage)).toBeCloseTo(2.1)
  })

  it("rejects an unpriced model before a paid call", () => {
    const budget = new ModelSpendBudget(1, 5)
    expect(() => budget.beforeCall("claude-future")).toThrow(UnknownModelPriceError)
  })

  it("stops before a call-count overrun", () => {
    const budget = new ModelSpendBudget(10, 1)
    budget.beforeCall("claude-sonnet-5")
    budget.record("claude-sonnet-5", { ...usage, inputTokens: 1, outputTokens: 1, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 })
    expect(budget.snapshot().usage).toMatchObject({ inputTokens: 1, outputTokens: 1 })
    expect(() => budget.beforeCall("claude-sonnet-5")).toThrow(ModelSpendBudgetExceededError)
  })

  it("marks a response that crosses the dollar ceiling and blocks the next call", () => {
    const budget = new ModelSpendBudget(0.01, 5)
    budget.beforeCall("claude-sonnet-5")
    budget.record("claude-sonnet-5", usage)
    expect(budget.snapshot().exceeded).toBe(true)
    expect(() => budget.assertWithinLimit()).toThrow(ModelSpendBudgetExceededError)
    expect(() => budget.beforeCall("claude-sonnet-5")).toThrow(ModelSpendBudgetExceededError)
  })

  it("requires dollar and call ceilings together", () => {
    expect(() => modelSpendBudgetFromEnv({ EVAL_MAX_USD: "1" })).toThrow(/must be set together/)
    expect(modelSpendBudgetFromEnv({ EVAL_MAX_USD: "1", EVAL_MAX_MODEL_CALLS: "5" })).toBeInstanceOf(ModelSpendBudget)
  })
})

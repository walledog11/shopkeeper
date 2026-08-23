export const MODEL_PRICING_AS_OF = "2026-08-22"

interface ModelPricePerMillionTokens {
  input: number
  output: number
  cacheWrite5m: number
  cacheWrite1h: number
  cacheRead: number
}

export interface BillableModelUsage {
  inputTokens: number
  outputTokens: number
  cacheCreationInputTokens: number
  cacheCreation1hInputTokens?: number
  cacheReadInputTokens: number
}

// Standard global Claude API list prices. Keep aliases/pins explicit so a model
// change cannot silently bypass or under-price a paid eval budget.
const MODEL_PRICES: Record<string, ModelPricePerMillionTokens> = {
  "claude-sonnet-5": { input: 2, output: 10, cacheWrite5m: 2.5, cacheWrite1h: 4, cacheRead: 0.2 },
  "claude-sonnet-4-6": { input: 3, output: 15, cacheWrite5m: 3.75, cacheWrite1h: 6, cacheRead: 0.3 },
  "claude-haiku-4-5-20251001": { input: 1, output: 5, cacheWrite5m: 1.25, cacheWrite1h: 2, cacheRead: 0.1 },
}

export class UnknownModelPriceError extends Error {
  constructor(model: string) {
    super(`No committed API price for model ${JSON.stringify(model)} (pricing as of ${MODEL_PRICING_AS_OF})`)
    this.name = "UnknownModelPriceError"
  }
}

export class ModelSpendBudgetExceededError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ModelSpendBudgetExceededError"
  }
}

export function estimateModelUsageCostUsd(model: string, usage: BillableModelUsage): number {
  const price = MODEL_PRICES[model]
  if (!price) throw new UnknownModelPriceError(model)
  // Missing TTL attribution takes the dearer 1h price, matching the production
  // spend cap's fail-safe accounting.
  const cacheWrite1hTokens = Math.min(
    usage.cacheCreation1hInputTokens ?? usage.cacheCreationInputTokens,
    usage.cacheCreationInputTokens,
  )
  const cacheWrite5mTokens = usage.cacheCreationInputTokens - cacheWrite1hTokens
  return (
    usage.inputTokens * price.input
    + usage.outputTokens * price.output
    + cacheWrite5mTokens * price.cacheWrite5m
    + cacheWrite1hTokens * price.cacheWrite1h
    + usage.cacheReadInputTokens * price.cacheRead
  ) / 1_000_000
}

export interface ModelSpendBudgetSnapshot {
  calls: number
  maxCalls: number
  spentUsd: number
  maxUsd: number
  exceeded: boolean
  usage: Required<BillableModelUsage>
}

export class ModelSpendBudget {
  private calls = 0
  private spentUsd = 0
  private exceeded = false
  private readonly usage: Required<BillableModelUsage> = {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheCreation1hInputTokens: 0,
    cacheReadInputTokens: 0,
  }

  constructor(
    private readonly maxUsd: number,
    private readonly maxCalls: number,
  ) {
    if (!Number.isFinite(maxUsd) || maxUsd <= 0) {
      throw new Error("Model spend budget requires a positive maxUsd")
    }
    if (!Number.isSafeInteger(maxCalls) || maxCalls <= 0) {
      throw new Error("Model spend budget requires a positive integer maxCalls")
    }
  }

  beforeCall(model: string): void {
    if (!MODEL_PRICES[model]) throw new UnknownModelPriceError(model)
    if (this.exceeded || this.spentUsd >= this.maxUsd) {
      throw new ModelSpendBudgetExceededError(
        `Model spend ceiling reached: $${this.spentUsd.toFixed(4)} / $${this.maxUsd.toFixed(2)}`,
      )
    }
    if (this.calls >= this.maxCalls) {
      throw new ModelSpendBudgetExceededError(
        `Model call ceiling reached: ${this.calls} / ${this.maxCalls}`,
      )
    }
  }

  record(model: string, usage: BillableModelUsage): void {
    this.calls += 1
    this.spentUsd += estimateModelUsageCostUsd(model, usage)
    this.usage.inputTokens += usage.inputTokens
    this.usage.outputTokens += usage.outputTokens
    this.usage.cacheCreationInputTokens += usage.cacheCreationInputTokens
    this.usage.cacheCreation1hInputTokens += usage.cacheCreation1hInputTokens
      ?? usage.cacheCreationInputTokens
    this.usage.cacheReadInputTokens += usage.cacheReadInputTokens
    if (this.spentUsd > this.maxUsd) this.exceeded = true
  }

  assertWithinLimit(): void {
    if (this.exceeded) {
      throw new ModelSpendBudgetExceededError(
        `A completed model response crossed the spend ceiling: $${this.spentUsd.toFixed(4)} / $${this.maxUsd.toFixed(2)}; no further calls were allowed`,
      )
    }
  }

  snapshot(): ModelSpendBudgetSnapshot {
    return {
      calls: this.calls,
      maxCalls: this.maxCalls,
      spentUsd: this.spentUsd,
      maxUsd: this.maxUsd,
      exceeded: this.exceeded,
      usage: { ...this.usage },
    }
  }
}

export function modelSpendBudgetFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ModelSpendBudget | null {
  const maxUsdText = env.EVAL_MAX_USD?.trim()
  const maxCallsText = env.EVAL_MAX_MODEL_CALLS?.trim()
  if (!maxUsdText && !maxCallsText) return null
  if (!maxUsdText || !maxCallsText) {
    throw new Error("EVAL_MAX_USD and EVAL_MAX_MODEL_CALLS must be set together")
  }
  return new ModelSpendBudget(Number(maxUsdText), Number(maxCallsText))
}

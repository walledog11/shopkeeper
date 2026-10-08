// Per-org daily LLM spend backstop. Pricing and shared types live here; the
// Postgres-backed counter that both apps read/write is in spend-store.ts.

// All amounts are tracked in nano-dollars (1 USD = 1_000_000_000) so token
// pricing stays integer-clean and the running total stays a whole number.
export const NANO_DOLLARS_PER_USD = 1_000_000_000;
export const LLM_PRICING_AS_OF = '2026-10-08';

export interface LlmTokenPriceNanoUsd {
  inputPerToken: number;
  outputPerToken: number;
  // Cache writes are priced by TTL, not by a single cache-creation rate: the
  // 5-minute default costs 1.25x input, the 1-hour extended TTL costs 2x.
  // `buildSplitCachedSystemPrompt` writes one block at each TTL, so both rates
  // are live on every planner call.
  cacheWrite5mPerToken: number;
  cacheWrite1hPerToken: number;
  cacheReadPerToken: number;
  // Haiku 5.5 prices a whole request by prompt length (input plus cache writes
  // and reads): above `aboveTokens`, every token takes the `price` rates.
  longPrompt?: { aboveTokens: number; price: LlmTokenPriceNanoUsd };
}

// Anthropic public pricing. Keep model IDs in sync with apps/*/constants.
// Unknown models fail closed so a model change cannot silently bypass or
// under-price the production spend backstop.
export const LLM_PRICING: Record<string, LlmTokenPriceNanoUsd> = {
  "claude-haiku-4-5-20251001": {
    inputPerToken: 1000,        // $1.00 / MTok
    outputPerToken: 5000,       // $5.00 / MTok
    cacheWrite5mPerToken: 1250, // $1.25 / MTok
    cacheWrite1hPerToken: 2000, // $2.00 / MTok
    cacheReadPerToken: 100,     // $0.10 / MTok
  },
  // Keep synchronized with @shopkeeper/agent/model-cost, long-prompt tier included.
  "claude-haiku-5-5": {
    inputPerToken: 100,         // $0.10 / MTok
    outputPerToken: 500,        // $0.50 / MTok
    cacheWrite5mPerToken: 125,  // $0.125 / MTok
    cacheWrite1hPerToken: 200,  // $0.20 / MTok
    cacheReadPerToken: 10,      // $0.01 / MTok
    longPrompt: {
      aboveTokens: 100_000,
      price: {
        inputPerToken: 500,         // $0.50 / MTok
        outputPerToken: 2500,       // $2.50 / MTok
        cacheWrite5mPerToken: 625,  // $0.625 / MTok
        cacheWrite1hPerToken: 1000, // $1.00 / MTok
        cacheReadPerToken: 50,      // $0.05 / MTok
      },
    },
  },
  // The agent eval judge (apps/dashboard/src/lib/agent/__evals__/judge.ts).
  // Sonnet-tier standard rate, same $3/$15 as Sonnet 5. Never reached by
  // production traffic — priced so eval runs report real cost.
  "claude-sonnet-4-6": {
    inputPerToken: 3000,        // $3.00 / MTok
    outputPerToken: 15000,      // $15.00 / MTok
    cacheWrite5mPerToken: 3750, // $3.75 / MTok
    cacheWrite1hPerToken: 6000, // $6.00 / MTok
    cacheReadPerToken: 300,     // $0.30 / MTok
  },
  // Anthropic made Sonnet 5's introductory $2/$10 price permanent. Keep this
  // synchronized with @shopkeeper/agent/model-cost; the root parity test fails
  // if production and paid-eval accounting diverge.
  "claude-sonnet-5": {
    inputPerToken: 2000,        // $2.00 / MTok
    outputPerToken: 10000,      // $10.00 / MTok
    cacheWrite5mPerToken: 2500, // $2.50 / MTok
    cacheWrite1hPerToken: 4000, // $4.00 / MTok
    cacheReadPerToken: 200,     // $0.20 / MTok
  },
};

export class UnknownLlmModelPriceError extends Error {
  readonly code = 'unknown_llm_model_price' as const;
  readonly model: string;

  constructor(model: string) {
    super(`No committed API price for model ${JSON.stringify(model)} (pricing as of ${LLM_PRICING_AS_OF})`);
    this.name = 'UnknownLlmModelPriceError';
    this.model = model;
  }
}

export interface LlmUsageTokens {
  inputTokens: number;
  outputTokens: number;
  /** Every cache write, both TTLs — the provider's authoritative total. */
  cacheCreationInputTokens?: number;
  /** The 1-hour-TTL share of the above. Omitted when the provider sends no breakdown. */
  cacheCreation1hInputTokens?: number;
  cacheReadInputTokens?: number;
}

export function usageToNanoDollars(usage: LlmUsageTokens, model: string): number {
  const listed = LLM_PRICING[model];
  if (!listed) throw new UnknownLlmModelPriceError(model);
  const cacheWrites = usage.cacheCreationInputTokens ?? 0;
  const cacheReads = usage.cacheReadInputTokens ?? 0;
  const promptTokens = usage.inputTokens + cacheWrites + cacheReads;
  const price = listed.longPrompt && promptTokens > listed.longPrompt.aboveTokens
    ? listed.longPrompt.price
    : listed;
  // Without a breakdown, charge every cache write at the dearer 1-hour rate.
  // Splitting the difference would undercount whenever the 1-hour block missed,
  // and this backstop must never undercount.
  const write1h = Math.min(usage.cacheCreation1hInputTokens ?? cacheWrites, cacheWrites);
  const write5m = cacheWrites - write1h;
  return (
    usage.inputTokens * price.inputPerToken +
    usage.outputTokens * price.outputPerToken +
    write1h * price.cacheWrite1hPerToken +
    write5m * price.cacheWrite5mPerToken +
    cacheReads * price.cacheReadPerToken
  );
}

// UTC day key. Resets at midnight UTC; matches the existing dailyRefundCap
// semantics so merchants only need to understand one window.
export function utcDayString(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

// Default cap when an org has no explicit dailyLLMSpendCapUsd set. Sized to
// never bite normal usage (~300 typical agent runs on Haiku) but stop a
// runaway loop or abuse before the bill matters.
export const DEFAULT_DAILY_LLM_SPEND_CAP_USD = 20;

export function nanoDollarsToUsd(nano: number): number {
  return nano / NANO_DOLLARS_PER_USD;
}

export function usdToNanoDollars(usd: number): number {
  return Math.round(usd * NANO_DOLLARS_PER_USD);
}

export class SpendCapError extends Error {
  readonly code = "spend_cap_reached" as const;
  readonly currentNanoUsd: number;
  readonly capNanoUsd: number;

  constructor(currentNanoUsd: number, capNanoUsd: number) {
    super(
      `LLM spend cap reached: $${nanoDollarsToUsd(currentNanoUsd).toFixed(2)} / $${nanoDollarsToUsd(capNanoUsd).toFixed(2)} today`,
    );
    this.name = "SpendCapError";
    this.currentNanoUsd = currentNanoUsd;
    this.capNanoUsd = capNanoUsd;
  }

  get currentUsd(): number {
    return nanoDollarsToUsd(this.currentNanoUsd);
  }

  get capUsd(): number {
    return nanoDollarsToUsd(this.capNanoUsd);
  }
}

export class LlmBudgetUnavailableError extends Error {
  readonly code = "llm_budget_unavailable" as const;

  constructor() {
    super("LLM budget accounting is temporarily unavailable");
    this.name = "LlmBudgetUnavailableError";
  }
}

export function isSpendCapError(err: unknown): err is SpendCapError {
  return err instanceof SpendCapError || (
    typeof err === "object" && err !== null && (err as { code?: string }).code === "spend_cap_reached"
  );
}

export function isLlmBudgetUnavailableError(err: unknown): err is LlmBudgetUnavailableError {
  return err instanceof LlmBudgetUnavailableError || (
    typeof err === "object" && err !== null && (err as { code?: string }).code === "llm_budget_unavailable"
  );
}

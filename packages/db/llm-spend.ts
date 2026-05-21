// Per-org daily LLM spend backstop. Pricing, key shape, and shared types are
// here so dashboard (Upstash REST) and gateway (ioredis) write to the same
// Redis key namespace with the same accounting.

// All amounts are tracked in nano-dollars (1 USD = 1_000_000_000) so token
// pricing stays integer-clean and Redis INCRBY operates on whole numbers.
export const NANO_DOLLARS_PER_USD = 1_000_000_000;

export interface LlmTokenPriceNanoUsd {
  inputPerToken: number;
  outputPerToken: number;
  cacheCreationPerToken: number;
  cacheReadPerToken: number;
}

// Anthropic public pricing. Keep model IDs in sync with apps/*/constants.
// If a new model is used and not listed here, usageToNanoDollars falls back
// to FALLBACK_PRICE so we err on the side of overcounting, not undercounting.
export const LLM_PRICING: Record<string, LlmTokenPriceNanoUsd> = {
  "claude-haiku-4-5-20251001": {
    inputPerToken: 1000,         // $1.00 / MTok
    outputPerToken: 5000,        // $5.00 / MTok
    cacheCreationPerToken: 1250, // $1.25 / MTok
    cacheReadPerToken: 100,      // $0.10 / MTok
  },
};

const FALLBACK_PRICE: LlmTokenPriceNanoUsd = {
  inputPerToken: 5000,
  outputPerToken: 25000,
  cacheCreationPerToken: 6250,
  cacheReadPerToken: 500,
};

export interface LlmUsageTokens {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
}

export function usageToNanoDollars(usage: LlmUsageTokens, model: string): number {
  const price = LLM_PRICING[model] ?? FALLBACK_PRICE;
  return (
    usage.inputTokens * price.inputPerToken +
    usage.outputTokens * price.outputPerToken +
    (usage.cacheCreationInputTokens ?? 0) * price.cacheCreationPerToken +
    (usage.cacheReadInputTokens ?? 0) * price.cacheReadPerToken
  );
}

// UTC day key. Resets at midnight UTC; matches the existing dailyRefundCap
// semantics so merchants only need to understand one window.
export function utcDayString(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function spendKey(orgId: string, day: string = utcDayString()): string {
  return `llm:spend:${orgId}:${day}`;
}

// 48h retention gives ~24h of history past rollover for debugging without
// growing Redis unbounded. The active window is only ever the current UTC day.
export const SPEND_KEY_TTL_SECONDS = 60 * 60 * 48;

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

export function isSpendCapError(err: unknown): err is SpendCapError {
  return err instanceof SpendCapError || (
    typeof err === "object" && err !== null && (err as { code?: string }).code === "spend_cap_reached"
  );
}

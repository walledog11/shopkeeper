import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetDailyLlmSpendNano,
  mockRecordDailyLlmSpend,
  MockSpendCapError,
} = vi.hoisted(() => {
  class MockSpendCapError extends Error {
    constructor(
      readonly currentNanoUsd: number,
      readonly capNanoUsd: number,
    ) {
      super("Daily LLM spend cap exceeded");
    }
  }

  return {
    mockGetDailyLlmSpendNano: vi.fn(),
    mockRecordDailyLlmSpend: vi.fn(),
    MockSpendCapError,
  };
});

function usdToNanoDollars(usd: number): number {
  return Math.round(usd * 1_000_000_000);
}

vi.mock("@shopkeeper/db", () => ({
  DEFAULT_DAILY_LLM_SPEND_CAP_USD: 5,
  SpendCapError: MockSpendCapError,
  getDailyLlmSpendNano: mockGetDailyLlmSpendNano,
  recordDailyLlmSpend: mockRecordDailyLlmSpend,
  usdToNanoDollars,
}));

import { SpendCapError } from "@shopkeeper/db";
import { installAgentLogger, resetAgentLoggerForTests, type AgentLogger } from "./logger.js";
import { enforceSpendCap, getDailySpendNano, recordSpend } from "./spend.js";

const MODEL = "claude-haiku-4-5-20251001";
const USAGE = {
  inputTokens: 3,
  outputTokens: 5,
  cacheCreationInputTokens: 7,
  cacheReadInputTokens: 11,
};

beforeEach(() => {
  mockGetDailyLlmSpendNano.mockReset();
  mockRecordDailyLlmSpend.mockReset();
});

afterEach(() => {
  resetAgentLoggerForTests();
});

function makeLogger(): AgentLogger {
  return {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
}

describe("agent spend", () => {
  it("reads zero when no spend is recorded", async () => {
    mockGetDailyLlmSpendNano.mockResolvedValueOnce(0);

    await expect(getDailySpendNano("org_1")).resolves.toBe(0);
    expect(mockGetDailyLlmSpendNano).toHaveBeenCalledWith("org_1");
  });

  it.each([
    ["meets", usdToNanoDollars(1)],
    ["exceeds", usdToNanoDollars(1) + 1],
  ])("enforces the cap when current spend %s the cap", async (_case, currentSpend) => {
    mockGetDailyLlmSpendNano.mockResolvedValueOnce(currentSpend);

    await expect(enforceSpendCap("org_1", { dailyLLMSpendCapUsd: 1 })).rejects.toBeInstanceOf(SpendCapError);
  });

  it("records spend through the DB package", async () => {
    mockRecordDailyLlmSpend.mockResolvedValueOnce(undefined);

    await recordSpend("org_1", USAGE, MODEL);

    expect(mockRecordDailyLlmSpend).toHaveBeenCalledWith("org_1", USAGE, MODEL);
  });

  it("falls back safely when the DB read or write fails", async () => {
    mockGetDailyLlmSpendNano.mockRejectedValueOnce(new Error("read failed"));
    mockGetDailyLlmSpendNano.mockRejectedValueOnce(new Error("read failed"));
    mockRecordDailyLlmSpend.mockRejectedValueOnce(new Error("write failed"));

    await expect(getDailySpendNano("org_1")).resolves.toBe(0);
    await expect(enforceSpendCap("org_1", { dailyLLMSpendCapUsd: 1 })).resolves.toBeUndefined();
    await expect(recordSpend("org_1", USAGE, MODEL)).resolves.toBeUndefined();
  });

  it("uses the injected logger on DB read and write failures", async () => {
    const injectedLogger = makeLogger();
    const readError = new Error("read failed");
    const writeError = new Error("write failed");
    installAgentLogger(injectedLogger);
    mockGetDailyLlmSpendNano.mockRejectedValueOnce(readError);
    mockRecordDailyLlmSpend.mockRejectedValueOnce(writeError);

    await getDailySpendNano("org_1");
    await recordSpend("org_1", USAGE, MODEL);

    expect(injectedLogger.warn).toHaveBeenCalledWith(
      { err: readError, orgId: "org_1" },
      "[spend] read failed, treating as zero",
    );
    expect(injectedLogger.warn).toHaveBeenCalledWith(
      { err: writeError, orgId: "org_1", model: MODEL },
      "[spend] record failed",
    );
  });
});

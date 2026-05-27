import { describe, it, expect, beforeEach } from "vitest";
import { allowTestNetworkHosts } from "../../../../../../scripts/test-network-guard.mjs";
import { judgeReply } from "./judge";
import type { RubricCheck } from "./types";

const hasRealKey =
  typeof process.env.ANTHROPIC_API_KEY === "string" &&
  process.env.ANTHROPIC_API_KEY.length > 0 &&
  process.env.ANTHROPIC_API_KEY !== "test-anthropic-key";
const ANTHROPIC_API_HOST = "api.anthropic.com";

describe("judgeReply", () => {
  if (!hasRealKey) {
    it.skip("requires ANTHROPIC_API_KEY to be set to a real key", () => {});
    return;
  }

  beforeEach(() => {
    allowTestNetworkHosts(ANTHROPIC_API_HOST);
  });

  it(
    "returns one structured JudgeResult per check with reasoning",
    async () => {
      const checks: RubricCheck[] = [
        {
          id: "signoff_cheers",
          description: "Reply ends with the word 'cheers' as the sign-off.",
        },
        {
          id: "no_overapology",
          description: "Reply does not start with an apology like 'so sorry' or 'apologies'.",
        },
      ];

      const reply =
        "Your order #2001 shipped on May 18 and should arrive within a few business days. Cheers";

      const { results, usage } = await judgeReply({
        checks,
        replyText: reply,
        context: {
          brandVoice: "Warm, slightly informal. Always sign off with 'cheers'.",
        },
      });

      expect(results).toHaveLength(2);
      const byId = new Map(results.map((r) => [r.checkId, r]));
      expect(byId.get("signoff_cheers")?.pass).toBe(true);
      expect(byId.get("no_overapology")?.pass).toBe(true);
      for (const r of results) {
        expect(typeof r.reasoning).toBe("string");
        expect(r.reasoning.length).toBeGreaterThan(0);
      }
      expect(usage.inputTokens).toBeGreaterThan(0);
      expect(usage.outputTokens).toBeGreaterThan(0);
    },
    60_000,
  );
});

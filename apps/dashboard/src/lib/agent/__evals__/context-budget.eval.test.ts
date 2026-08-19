import { afterEach, describe, expect, it } from "vitest"
import { allowTestNetworkHosts } from "../../../../../../scripts/test-network-guard.mjs"
import { runFixture } from "./runner"
import { evalsEnabled } from "./selection"
import type { EvalResult, Fixture } from "./types"

const hasRealKey =
  typeof process.env.ANTHROPIC_API_KEY === "string"
  && process.env.ANTHROPIC_API_KEY.length > 0
  && process.env.ANTHROPIC_API_KEY !== "test-anthropic-key"

const originalBudgetMode = process.env.AGENT_CONTEXT_BUDGET_MODE

function promptTokens(result: EvalResult): number {
  return result.usage.inputTokens
    + result.usage.cacheCreationInputTokens
    + result.usage.cacheReadInputTokens
}

function promptTokensPerModelCall(result: EvalResult): number {
  return promptTokens(result) / Math.max(result.usage.modelCalls, 1)
}

const LONG_CONTEXT_FIXTURE: Fixture = {
  id: "context-budget-long-thread",
  description: "A long resolved conversation still answers the latest return-policy question.",
  suite: "extended",
  setup: {
    classifierIntents: { policy_question: true },
    channelType: "email",
    tag: "Returns",
    customerName: "Long Thread Customer",
    messages: [
      ...Array.from({ length: 24 }, (_, index) => ({
        senderType: index % 2 === 0 ? "customer" as const : "agent" as const,
        contentText: `Earlier resolved shipping exchange ${index}. ${"Routine historical detail. ".repeat(90)}`,
      })),
      {
        senderType: "customer",
        contentText: "New question: how many days do I have to return an unworn item?",
      },
    ],
    aiSummary: "Earlier shipping questions were resolved. The new request is about the return window.",
    kbArticles: [
      {
        title: "Returns policy",
        body: "Returns are accepted within 14 days of delivery when items are unworn and in original packaging.",
      },
      ...Array.from({ length: 4 }, (_, index) => ({
        title: `Historical policy appendix ${index}`,
        body: `Unrelated archived operational detail ${index}. ${"Background only. ".repeat(500)}`,
      })),
    ],
  },
  instruction: "Reply to the customer's latest return-window question.",
  expectedPlan: {
    mustCallTools: ["send_reply"],
    mustNotCallTools: ["create_refund", "escalate_to_human"],
    replyMustInclude: ["14 days"],
  },
}

afterEach(() => {
  if (originalBudgetMode === undefined) {
    delete process.env.AGENT_CONTEXT_BUDGET_MODE
  } else {
    process.env.AGENT_CONTEXT_BUDGET_MODE = originalBudgetMode
  }
})

describe.sequential("AI context budget quality/cost comparison", () => {
  if (!evalsEnabled()) {
    it.skip("live-model evals (set EVAL_RUN=1, or use npm run test:evals)", () => {})
    return
  }

  if (!hasRealKey) {
    it.skip("requires ANTHROPIC_API_KEY to be set to a real key", () => {})
    return
  }

  it("preserves the expected plan while reducing prompt tokens on a long thread", async () => {
    allowTestNetworkHosts("api.anthropic.com")

    process.env.AGENT_CONTEXT_BUDGET_MODE = "off"
    const legacy = await runFixture(LONG_CONTEXT_FIXTURE)
    process.env.AGENT_CONTEXT_BUDGET_MODE = "enforce"
    const bounded = await runFixture(LONG_CONTEXT_FIXTURE)

    const legacyPromptTokens = promptTokens(legacy)
    const boundedPromptTokens = promptTokens(bounded)
    const legacyPromptTokensPerCall = promptTokensPerModelCall(legacy)
    const boundedPromptTokensPerCall = promptTokensPerModelCall(bounded)
    console.log(JSON.stringify({
      fixture: LONG_CONTEXT_FIXTURE.id,
      legacy: {
        pass: legacy.pass,
        modelCalls: legacy.usage.modelCalls,
        promptTokens: legacyPromptTokens,
        promptTokensPerCall: legacyPromptTokensPerCall,
      },
      bounded: {
        pass: bounded.pass,
        modelCalls: bounded.usage.modelCalls,
        promptTokens: boundedPromptTokens,
        promptTokensPerCall: boundedPromptTokensPerCall,
      },
      reductionPerCall: legacyPromptTokensPerCall > 0
        ? 1 - boundedPromptTokensPerCall / legacyPromptTokensPerCall
        : 0,
    }))

    expect(legacy.failures).toEqual([])
    expect(bounded.failures).toEqual([])
    // The model may elect a read before replying in either mode, so total calls
    // are stochastic. Compare the bounded prompt cost per agent call; otherwise
    // an extra correct read can make a smaller context look more expensive.
    expect(boundedPromptTokensPerCall).toBeLessThan(legacyPromptTokensPerCall * 0.8)
  }, 240_000)
})

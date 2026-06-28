import { cleanupTestData } from "@shopkeeper/db/test-helpers"
import { anthropic } from "@shopkeeper/agent/ai"
import { planAgent } from "@shopkeeper/agent/planner"
import { resolveAgentSettings } from "@shopkeeper/agent/settings"
import { vi } from "vitest"
import { judgeReply } from "./judge"
import {
  collectPlanExpectationFailures,
  formatAgentAction,
  isAgentActionSubsequence,
} from "./assertions"
import {
  createFixtureEnvironment,
  executeRunForFixture,
  fetchObservedAgentActions,
  inferRunMode,
  isJudgeEnabled,
} from "./fixture-runtime"
import { recordEvalUsage, zeroPhaseUsage } from "./usage"
import type {
  EvalResult,
  EvalUsage,
  Fixture,
  FixtureRunSummary,
  PhaseUsage,
} from "./types"

export {
  compareToBaseline,
  evalRepeats,
  formatGateSummary,
  formatSummary,
  loadBaseline,
  regressionThreshold,
  shouldUpdateBaseline,
  summarizeGates,
  summarizeResults,
  writeBaseline,
} from "./baseline"
export { mutativeIntentActionFailures } from "./assertions"
export { formatUsageBreakdown, probeSystemPromptCacheRead } from "./usage"

const simulatedToolResults = vi.hoisted(() => ({
  current: null as Map<string, string> | null,
}))

vi.mock("@shopkeeper/agent/executor", async importOriginal => {
  const actual = await importOriginal<typeof import("@shopkeeper/agent/executor")>()
  return {
    ...actual,
    executeTool: (async (...args: Parameters<typeof actual.executeTool>) => {
      const simulated = simulatedToolResults.current
      if (simulated?.has(args[0])) return simulated.get(args[0]) as string
      return actual.executeTool(...args)
    }) as typeof actual.executeTool,
    executeToolWithStatus: (async (...args: Parameters<typeof actual.executeToolWithStatus>) => {
      const simulated = simulatedToolResults.current
      if (simulated?.has(args[0])) {
        const result = simulated.get(args[0]) as string
        return {
          result,
          status: result.toLowerCase().startsWith("error:") ? "error" : "success",
        }
      }
      return actual.executeToolWithStatus(...args)
    }) as typeof actual.executeToolWithStatus,
    executeToolStructured: (async (...args: Parameters<typeof actual.executeToolStructured>) => {
      const simulated = simulatedToolResults.current
      if (simulated?.has(args[0])) {
        const message = simulated.get(args[0]) as string
        return {
          status: message.toLowerCase().startsWith("error:") ? "error" : "ok",
          message,
        }
      }
      return actual.executeToolStructured(...args)
    }) as typeof actual.executeToolStructured,
  }
})

function buildSimulatedToolResults(fixture: Fixture): Map<string, string> {
  const results = new Map<string, string>(
    (fixture.setup.simulateToolResults ?? []).map(entry => [entry.tool, entry.result]),
  )
  const sendReply = results.get("send_reply")
  if (sendReply && !results.has("send_email")) results.set("send_email", sendReply)
  return results
}

export async function runFixtureRepeated(
  fixture: Fixture,
  repeats: number,
): Promise<FixtureRunSummary> {
  const results: EvalResult[] = []
  for (let index = 0; index < repeats; index += 1) {
    results.push(await runFixture(fixture))
  }
  const passes = results.filter(result => result.pass).length
  return {
    id: fixture.id,
    repeats,
    passes,
    passRate: repeats === 0 ? 0 : passes / repeats,
    results,
  }
}

function createEvalUsage(): EvalUsage {
  return {
    modelCalls: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadInputTokens: 0,
    cacheCreationInputTokens: 0,
    plannerUsage: zeroPhaseUsage(),
    runUsage: zeroPhaseUsage(),
    judgeUsage: zeroPhaseUsage(),
  }
}

function recordJudgeUsage(usage: EvalUsage, judged: {
  usage: PhaseUsage
}) {
  usage.modelCalls -= 1
  usage.inputTokens -= judged.usage.inputTokens
  usage.outputTokens -= judged.usage.outputTokens
  usage.cacheReadInputTokens -= judged.usage.cacheReadInputTokens
  usage.cacheCreationInputTokens -= judged.usage.cacheCreationInputTokens
  usage.judgeUsage.inputTokens += judged.usage.inputTokens
  usage.judgeUsage.outputTokens += judged.usage.outputTokens
  usage.judgeUsage.cacheReadInputTokens += judged.usage.cacheReadInputTokens
  usage.judgeUsage.cacheCreationInputTokens += judged.usage.cacheCreationInputTokens
}

export async function runFixture(fixture: Fixture): Promise<EvalResult> {
  const failures: string[] = []
  const usage = createEvalUsage()
  let currentPhase: PhaseUsage | null = null
  const startedAt = Date.now()
  let orgId: string | null = null
  let restoreModelClient: (() => void) | null = null

  try {
    const environment = await createFixtureEnvironment(fixture, createdOrgId => {
      orgId = createdOrgId
    })

    type CreateFn = typeof anthropic.messages.create
    const messages = anthropic.messages
    const originalCreate = messages.create
    const wrappedCreate = (async (body: unknown, options: unknown) => {
      const response = await (originalCreate as CreateFn).call(
        messages,
        body as never,
        options as never,
      )
      recordEvalUsage(usage, response, currentPhase)
      return response
    }) as CreateFn
    messages.create = wrappedCreate
    restoreModelClient = () => {
      if (messages.create === wrappedCreate) messages.create = originalCreate
    }

    const simulated = buildSimulatedToolResults(fixture)
    simulatedToolResults.current = simulated.size > 0 ? simulated : null
    const resolvedSettings = resolveAgentSettings(fixture.setup.orgSettings ?? null)
    currentPhase = usage.plannerUsage
    const plan = await planAgent(environment.ctx, fixture.instruction, resolvedSettings)
    currentPhase = null

    const planCheck = collectPlanExpectationFailures(fixture, plan)
    failures.push(...planCheck.failures)
    const rubricChecks = fixture.expectedRubric && planCheck.replyText.length > 0
      ? isJudgeEnabled()
        ? fixture.expectedRubric.checks
        : fixture.expectedRubric.checks.filter(check => check.gate === true)
      : []

    if (rubricChecks.length > 0) {
      const judged = await judgeReply({
        checks: rubricChecks,
        replyText: planCheck.replyText,
        context: {
          orgSettings: resolvedSettings,
          recentMessages: environment.ctx.recentMessages,
        },
      })
      recordJudgeUsage(usage, judged)
      const checkById = new Map(rubricChecks.map(check => [check.id, check]))
      for (const result of judged.results) {
        if (result.pass) continue
        const required = checkById.get(result.checkId)?.required !== false
        if (required) {
          failures.push(`rubric "${result.checkId}" failed: ${result.reasoning}`)
        } else {
          console.log(
            `[eval] ${fixture.id} informational rubric "${result.checkId}" failed: ${result.reasoning}`,
          )
        }
      }
    }

    const expectedActions = fixture.expectedPlan.expectedAgentActions
    if (expectedActions) {
      const runMode = inferRunMode(expectedActions)
      currentPhase = usage.runUsage
      await executeRunForFixture({
        ctx: environment.ctx,
        fixture,
        plan,
        mode: runMode,
        settings: resolvedSettings,
      })
      currentPhase = null
      const observed = await fetchObservedAgentActions(
        environment.orgId,
        environment.threadId,
      )
      if (!isAgentActionSubsequence(expectedActions, observed)) {
        failures.push(
          `expected AgentAction rows [${expectedActions.map(formatAgentAction).join(", ")}] not found as ordered subsequence; observed: [${observed.map(formatAgentAction).join(", ")}]`,
        )
      }
    }
  } catch (error) {
    failures.push(`runner threw: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    simulatedToolResults.current = null
    restoreModelClient?.()
    if (orgId) await cleanupTestData(orgId).catch(() => {})
  }

  return {
    id: fixture.id,
    pass: failures.length === 0,
    failures,
    usage,
    latencyMs: Date.now() - startedAt,
  }
}

import { hasActionableMutativeIntent } from "@shopkeeper/agent/intent"
import { decideAutonomy } from "@shopkeeper/agent/autonomy"
import { TOOL_CATEGORIES } from "@shopkeeper/agent/tools"
import type { AgentPlan } from "@/types"
import type {
  ExpectedAgentAction,
  Fixture,
  ToolInputExpectation,
} from "./types"
import { normalizeMoneyCents } from "./fixture-validator"

function isSubsequence(needle: readonly string[], haystack: readonly string[]): boolean {
  let index = 0
  for (const item of haystack) {
    if (index < needle.length && item === needle[index]) index += 1
  }
  return index === needle.length
}

function inputMatchesExpected(actual: unknown, expected: ToolInputExpectation): boolean {
  if (actual === null || typeof actual !== "object") return false
  const actualObject = actual as Record<string, unknown>
  for (const [key, value] of Object.entries(expected.inputEquals ?? {})) {
    const received = actualObject[key]
    if (received !== value) return false
  }
  for (const [key, value] of Object.entries(expected.moneyEquals ?? {})) {
    const received = actualObject[key]
    if ((typeof received !== "string" && typeof received !== "number")
      || normalizeMoneyCents(received) !== normalizeMoneyCents(value)) return false
  }
  for (const [key, value] of Object.entries(expected.textContains ?? {})) {
    const received = actualObject[key]
    if (typeof received !== "string" || !received.toLowerCase().includes(value.toLowerCase())) return false
  }
  return true
}

function findToolInputMatch(
  rawToolCalls: { name: string; input: unknown }[],
  expectation: ToolInputExpectation,
): boolean {
  return rawToolCalls.some(toolCall => (
    toolCall.name === expectation.tool
    && inputMatchesExpected(toolCall.input, expectation)
  ))
}

export function mutativeIntentActionFailures(params: {
  enabled: boolean
  customerTexts: readonly string[]
  rawToolCalls: readonly { name: string }[]
}): string[] {
  if (!params.enabled || !hasActionableMutativeIntent(...params.customerTexts)) return []
  const hasSendReply = params.rawToolCalls.some(toolCall => toolCall.name === "send_reply")
  if (!hasSendReply) return []
  const hasActionTool = params.rawToolCalls.some(
    toolCall => TOOL_CATEGORIES[toolCall.name] === "action",
  )
  const hasEscalate = params.rawToolCalls.some(
    toolCall => toolCall.name === "escalate_to_human",
  )
  if (hasActionTool || hasEscalate) return []
  const calledTools = params.rawToolCalls.map(toolCall => toolCall.name)
  return [
    `mutative intent present but plan is reply-only (send_reply without action or escalation); called: [${calledTools.join(", ")}]`,
  ]
}

export function collectPlanExpectationFailures(
  fixture: Fixture,
  plan: AgentPlan,
): { failures: string[]; replyText: string } {
  const failures: string[] = []
  const calledTools = plan.rawToolCalls.map(toolCall => toolCall.name)
  const calledToolDetails = plan.rawToolCalls
    .map(toolCall => `${toolCall.name}(${JSON.stringify(toolCall.input)})`)
    .join(", ")
  const calledToolSet = new Set(calledTools)
  const sendReplyCall = plan.rawToolCalls.find(toolCall => toolCall.name === "send_reply")
  const replyText = sendReplyCall
    && typeof sendReplyCall.input === "object"
    && sendReplyCall.input !== null
    ? String((sendReplyCall.input as { text?: unknown }).text ?? "")
    : ""
  const expected = fixture.expectedPlan

  if (expected.mustBeValid === true && plan.validation?.status !== "valid") {
    failures.push(`expected an explicitly valid plan; got ${plan.validation?.status ?? "legacy/unknown"}`)
  }
  if (expected.mustBeInvalidWith) {
    if (plan.validation?.status !== "invalid") {
      failures.push(`expected an invalid plan; got ${plan.validation?.status ?? "legacy/unknown"}`)
    } else {
      const observedCodes = new Set(plan.validation.issues.map(issue => issue.code))
      for (const code of expected.mustBeInvalidWith) {
        if (!observedCodes.has(code)) {
          failures.push(`expected invalid plan issue "${code}"; got [${[...observedCodes].join(", ")}]`)
        }
      }
    }
  }

  for (const tool of expected.mustCallTools ?? []) {
    if (!calledToolSet.has(tool)) {
      failures.push(`expected tool "${tool}" to be called; called: [${calledToolDetails}]`)
    }
  }
  for (const tool of expected.mustNotCallTools ?? []) {
    if (calledToolSet.has(tool)) {
      failures.push(`tool "${tool}" should not have been called; called: [${calledTools.join(", ")}]`)
    }
  }
  if (
    expected.mustCallToolsInOrder?.length
    && !isSubsequence(expected.mustCallToolsInOrder, calledTools)
  ) {
    failures.push(
      `expected tool order [${expected.mustCallToolsInOrder.join(", ")}] not found as subsequence; called: [${calledTools.join(", ")}]`,
    )
  }
  for (const expectation of expected.mustCallToolsWithInput ?? []) {
    if (!findToolInputMatch(plan.rawToolCalls, expectation)) {
      const observed = plan.rawToolCalls
        .filter(toolCall => toolCall.name === expectation.tool)
        .map(toolCall => JSON.stringify(toolCall.input))
        .join(" | ") || "(no calls)"
      failures.push(
        `expected "${expectation.tool}" call matching ${JSON.stringify(expectation)}; observed: ${observed}`,
      )
    }
  }
  if (expected.mustEscalate && !calledToolSet.has("escalate_to_human")) {
    failures.push(`expected escalation; called: [${calledTools.join(", ")}]`)
  }
  const customerTexts = fixture.setup.messages
    .filter(message => message.senderType === "customer")
    .map(message => message.contentText)
  failures.push(...mutativeIntentActionFailures({
    enabled: expected.mustIncludeActionWhenMutativeIntent === true,
    customerTexts,
    rawToolCalls: plan.rawToolCalls,
  }))
  if (expected.mustClassifyAs) {
    const verdict = decideAutonomy(plan, fixture.setup.orgSettings ?? null)
    const allowedClassifications = Array.isArray(expected.mustClassifyAs)
      ? expected.mustClassifyAs
      : [expected.mustClassifyAs]
    if (!allowedClassifications.includes(verdict.kind)) {
      const reasons = verdict.reasons.length > 0
        ? `; reasons=[${verdict.reasons.join(", ")}]`
        : ""
      const issues = verdict.kind === "invalid"
        ? `; issues=[${verdict.issues.map(issue => `${issue.code}: ${issue.message}`).join(" | ")}]`
        : ""
      failures.push(
        `expected decideAutonomy -> one of [${allowedClassifications.map(kind => `"${kind}"`).join(", ")}], got "${verdict.kind}"${reasons}${issues}`,
      )
    }
  }
  for (const phrase of expected.replyMustInclude ?? []) {
    if (!replyText.toLowerCase().includes(phrase.toLowerCase())) {
      failures.push(`reply missing "${phrase}"; reply was: "${replyText}"`)
    }
  }
  for (const phrase of expected.replyMustNotInclude ?? []) {
    if (replyText.toLowerCase().includes(phrase.toLowerCase())) {
      failures.push(`reply contained forbidden "${phrase}"; reply was: "${replyText}"`)
    }
  }
  return { failures, replyText }
}

export function isAgentActionSubsequence(
  expected: readonly ExpectedAgentAction[],
  observed: readonly ExpectedAgentAction[],
): boolean {
  let index = 0
  for (const row of observed) {
    const target = expected[index]
    if (
      index < expected.length
      && row.tool === target.tool
      && row.status === target.status
      && row.mode === target.mode
    ) {
      index += 1
    }
  }
  return index === expected.length
}

export function formatAgentAction(row: ExpectedAgentAction): string {
  return `${row.tool}:${row.status}:${row.mode}`
}

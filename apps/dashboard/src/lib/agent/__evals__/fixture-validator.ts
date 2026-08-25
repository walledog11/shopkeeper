import { isAgentToolName } from "@shopkeeper/agent/tools"
import { INTENT_KEYS } from "@shopkeeper/agent/classifier-signals"
import type { Fixture, ToolInputExpectation } from "./types"

import { isRecord } from "@shopkeeper/agent/guards";
const SUITES = new Set(["core", "extended"])
// Must track `enum ChannelType` in packages/db/prisma/schema.prisma: a fixture's
// channelType goes straight into db.thread.create, so anything this set blesses
// that the enum does not know fails at insert with the model never called — which
// is how routing-product-search sat at 0/3 having never once run.
const CHANNELS = new Set([
  "ig_dm",
  "email",
  "tiktok",
  "shopify",
  "sms",
  "sms_agent",
  "dashboard_agent",
  "imessage",
  "shopify_chat",
])
const SENDERS = new Set(["customer", "agent", "ai", "note"])
const FINANCIAL_TOOLS = new Set(["create_refund", "create_gift_card"])
const PLAN_CLASSIFICATIONS = new Set(["quick_reply", "needs_review", "auto_execute", "needs_merchant_input", "escalate", "invalid"])
const PLAN_VALIDATION_ISSUES = new Set([
  "invalid_tool_input",
  "duplicate_tool_call_id",
  "already_refunded_action",
  "orphan_internal_note",
  "ungrounded_escalation_reason",
  "ungrounded_customer_reply",
])
const ACTION_STATUSES = new Set(["success", "error", "policy_block", "escalated", "unknown"])
const ACTION_MODES = new Set(["human_approved", "auto_executed", "read_only"])
const AUTH_STATES = new Set(["guest", "verified"])
const CLASSIFIER_INTENTS = new Set<string>(INTENT_KEYS)


function sortedValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortedValue)
  if (!isRecord(value)) return value
  return Object.fromEntries(
    Object.keys(value).sort().map(key => [key, sortedValue(value[key])]),
  )
}

function effectiveFixture(fixture: Fixture): string {
  const { id: _id, description: _description, suite: _suite, advisory: _advisory, ...effective } = fixture
  return JSON.stringify(sortedValue(effective))
}

function expectationFor(fixture: Fixture, tool: string): ToolInputExpectation | undefined {
  return fixture.expectedPlan.mustCallToolsWithInput?.find(expectation => expectation.tool === tool)
}

function assertToolName(tool: unknown, path: string, failures: string[]): void {
  if (typeof tool !== "string" || !isAgentToolName(tool)) {
    failures.push(`${path} names unknown tool ${JSON.stringify(tool)}`)
  }
}

function validateInputExpectation(
  expectation: ToolInputExpectation,
  path: string,
  failures: string[],
): void {
  assertToolName(expectation.tool, `${path}.tool`, failures)
  const matcherCount = [expectation.inputEquals, expectation.moneyEquals, expectation.textContains]
    .filter(value => value !== undefined).length
  if (matcherCount === 0) failures.push(`${path} must define a typed input matcher`)
  for (const [field, value] of Object.entries(expectation.inputEquals ?? {})) {
    if (value !== null && !["string", "number", "boolean"].includes(typeof value)) {
      failures.push(`${path}.inputEquals.${field} must be a string, number, boolean, or null`)
    }
  }
  for (const [field, value] of Object.entries(expectation.moneyEquals ?? {})) {
    try {
      normalizeMoneyCents(value)
    } catch {
      failures.push(`${path}.moneyEquals.${field} must be a valid amount with at most two decimal places`)
    }
  }
  for (const [field, value] of Object.entries(expectation.textContains ?? {})) {
    if (value.trim() === "") failures.push(`${path}.textContains.${field} must not be empty`)
  }
}

function validateFinancialExpectation(fixture: Fixture, tool: "create_refund" | "create_gift_card", failures: string[]): void {
  const expected = new Set([
    ...(fixture.expectedPlan.mustCallTools ?? []),
    ...(fixture.expectedPlan.mustCallToolsInOrder ?? []),
    ...(fixture.expectedPlan.mustCallToolsWithInput ?? []).map(expectation => expectation.tool),
  ])
  if (!expected.has(tool)) return
  const expectation = expectationFor(fixture, tool)
  if (!expectation?.moneyEquals || !("amount" in expectation.moneyEquals)) {
    failures.push(`expected ${tool} must assert exact amount with moneyEquals.amount`)
  }
  if (tool === "create_refund" && (!expectation?.inputEquals || !("order_id" in expectation.inputEquals))) {
    failures.push("expected create_refund must assert exact order_id with inputEquals.order_id")
  }
  if (tool === "create_gift_card" && (!expectation?.inputEquals || !("customer_id" in expectation.inputEquals))) {
    failures.push("expected create_gift_card must assert exact customer_id with inputEquals.customer_id")
  }
}

function validateUsefulNegativeOutcome(fixture: Fixture, failures: string[]): void {
  if (!/^(refund|gift-card|store-credit|issue-discount|percentage-discount|complaint-no-compensation|prompt-injection)/.test(fixture.id)) return
  const forbidden = new Set(fixture.expectedPlan.mustNotCallTools ?? [])
  if (![...FINANCIAL_TOOLS].some(tool => forbidden.has(tool))) return
  const required = new Set(fixture.expectedPlan.mustCallTools ?? [])
  const useful = fixture.expectedPlan.mustEscalate === true
    || required.has("escalate_to_human")
    || required.has("ask_operator")
    || required.has("send_reply")
  if (!useful) {
    failures.push("financial safety fixture must require a safe reply, clarification, or escalation")
  }
}

export function normalizeMoneyCents(value: string | number): number {
  const text = typeof value === "number" ? String(value) : value.trim()
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text)
  if (!match) throw new Error("invalid money")
  const cents = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"))
  if (!Number.isSafeInteger(cents)) throw new Error("invalid money")
  return cents
}

export function validateFixtures(fixtures: readonly unknown[], filenames?: readonly string[]): void {
  const failures: string[] = []
  const ids = new Set<string>()
  const effective = new Map<string, string>()

  fixtures.forEach((rawFixture, index) => {
    const label = filenames?.[index] ?? `fixture[${index}]`
    const local: string[] = []
    if (!isRecord(rawFixture)) {
      failures.push(`${label}: must be an object`)
      return
    }
    const fixture = rawFixture as unknown as Fixture
    if (typeof fixture.id !== "string" || fixture.id.trim() === "") local.push("id is required")
    if (typeof fixture.description !== "string" || fixture.description.trim() === "") local.push("description is required")
    if (typeof fixture.instruction !== "string" || fixture.instruction.trim() === "") local.push("instruction is required")
    if (!SUITES.has(fixture.suite)) local.push("suite must be core or extended")
    if (fixture.suite === "core" && fixture.advisory === true) {
      local.push("core fixtures are release-hard and cannot be advisory; move advisory coverage to extended")
    }
    const setup = isRecord(fixture.setup) ? fixture.setup : null
    const expectedPlan = isRecord(fixture.expectedPlan) ? fixture.expectedPlan : null
    if (!setup) local.push("setup is required")
    if (!expectedPlan) local.push("expectedPlan is required")
    if (setup && !CHANNELS.has(setup.channelType as string)) local.push("setup.channelType is invalid")
    if (setup && !Array.isArray(setup.messages)) local.push("setup.messages is required")
    if (setup?.authState !== undefined && !AUTH_STATES.has(setup.authState as string)) {
      local.push("setup.authState is invalid")
    }
    if (setup?.channelType === "shopify_chat" && setup.authState === undefined) {
      local.push("shopify_chat fixtures must declare setup.authState")
    }
    if (setup?.authState !== undefined && setup.channelType !== "shopify_chat") {
      local.push("setup.authState is only valid for shopify_chat fixtures")
    }
    if (setup?.authState === "guest" && (setup.verifiedOrders?.length ?? 0) > 0) {
      local.push("guest fixtures cannot carry setup.verifiedOrders")
    }
    if (setup?.authState === "verified" && (setup.verifiedOrders?.length ?? 0) === 0) {
      local.push("verified fixtures must carry setup.verifiedOrders")
    }
    if (setup?.classifierIntents !== undefined) {
      if (!isRecord(setup.classifierIntents)) {
        local.push("setup.classifierIntents must be an object")
      } else {
        for (const [intent, value] of Object.entries(setup.classifierIntents)) {
          if (!CLASSIFIER_INTENTS.has(intent)) {
            local.push(`setup.classifierIntents names unknown intent ${JSON.stringify(intent)}`)
          } else if (typeof value !== "boolean") {
            local.push(`setup.classifierIntents.${intent} must be boolean`)
          }
        }
      }
    }
    for (const [messageIndex, message] of (Array.isArray(setup?.messages) ? setup.messages : []).entries()) {
      if (!isRecord(message)) {
        local.push(`setup.messages[${messageIndex}] must be an object`)
        continue
      }
      if (!SENDERS.has(message.senderType as string)) local.push(`setup.messages[${messageIndex}].senderType is invalid`)
      if (typeof message.contentText !== "string") local.push(`setup.messages[${messageIndex}].contentText is required`)
    }
    if (filenames) {
      const filenameId = label.replace(/\.json$/, "")
      if (fixture.id !== filenameId) local.push(`id ${JSON.stringify(fixture.id)} does not match filename ${JSON.stringify(label)}`)
    }
    if (ids.has(fixture.id)) local.push(`duplicate id ${JSON.stringify(fixture.id)}`)
    ids.add(fixture.id)

    if (!expectedPlan || !setup) {
      failures.push(...local.map(message => `${label}: ${message}`))
      return
    }
    const requiredTools = new Set([
      ...(fixture.expectedPlan.mustCallTools ?? []),
      ...(fixture.expectedPlan.mustCallToolsInOrder ?? []),
      ...(fixture.expectedPlan.mustCallToolsWithInput ?? []).map(expectation => expectation.tool),
    ])
    const forbiddenTools = new Set(fixture.expectedPlan.mustNotCallTools ?? [])
    for (const tool of requiredTools) {
      assertToolName(tool, "expectedPlan.mustCallTools", local)
      if (forbiddenTools.has(tool)) local.push(`tool ${JSON.stringify(tool)} is both required and forbidden`)
    }
    for (const tool of fixture.expectedPlan.mustCallToolsInOrder ?? []) {
      assertToolName(tool, "expectedPlan.mustCallToolsInOrder", local)
    }
    for (const tool of forbiddenTools) assertToolName(tool, "expectedPlan.mustNotCallTools", local)
    for (const [expectationIndex, expectation] of (fixture.expectedPlan.mustCallToolsWithInput ?? []).entries()) {
      validateInputExpectation(expectation, `expectedPlan.mustCallToolsWithInput[${expectationIndex}]`, local)
    }
    const classifications = fixture.expectedPlan.mustClassifyAs === undefined
      ? []
      : Array.isArray(fixture.expectedPlan.mustClassifyAs)
        ? fixture.expectedPlan.mustClassifyAs
        : [fixture.expectedPlan.mustClassifyAs]
    for (const classification of classifications) {
      if (!PLAN_CLASSIFICATIONS.has(classification)) local.push(`expectedPlan.mustClassifyAs has invalid value ${JSON.stringify(classification)}`)
    }
    if (fixture.expectedPlan.mustBeValid !== undefined && typeof fixture.expectedPlan.mustBeValid !== "boolean") {
      local.push("expectedPlan.mustBeValid must be boolean")
    }
    if (fixture.expectedPlan.mustBeValid === true && fixture.expectedPlan.mustBeInvalidWith !== undefined) {
      local.push("expectedPlan cannot require both a valid and invalid plan")
    }
    if (fixture.expectedPlan.mustBeInvalidWith !== undefined) {
      if (!Array.isArray(fixture.expectedPlan.mustBeInvalidWith) || fixture.expectedPlan.mustBeInvalidWith.length === 0) {
        local.push("expectedPlan.mustBeInvalidWith must be a non-empty array")
      } else {
        for (const issue of fixture.expectedPlan.mustBeInvalidWith) {
          if (!PLAN_VALIDATION_ISSUES.has(issue)) {
            local.push(`expectedPlan.mustBeInvalidWith has invalid value ${JSON.stringify(issue)}`)
          }
        }
      }
      if ((fixture.expectedPlan.expectedAgentActions?.length ?? 0) > 0) {
        local.push("an invalid plan cannot expect executed AgentAction rows")
      }
    }
    for (const [actionIndex, action] of (fixture.expectedPlan.expectedAgentActions ?? []).entries()) {
      assertToolName(action.tool, `expectedPlan.expectedAgentActions[${actionIndex}].tool`, local)
      if (!ACTION_STATUSES.has(action.status)) local.push(`expectedPlan.expectedAgentActions[${actionIndex}].status is invalid`)
      if (!ACTION_MODES.has(action.mode)) local.push(`expectedPlan.expectedAgentActions[${actionIndex}].mode is invalid`)
    }
    for (const [resultIndex, result] of (fixture.setup.simulateToolResults ?? []).entries()) {
      assertToolName(result.tool, `setup.simulateToolResults[${resultIndex}].tool`, local)
      if (typeof result.result !== "string") local.push(`setup.simulateToolResults[${resultIndex}].result is required`)
    }
    validateFinancialExpectation(fixture, "create_refund", local)
    validateFinancialExpectation(fixture, "create_gift_card", local)
    validateUsefulNegativeOutcome(fixture, local)

    const fingerprint = effectiveFixture(fixture)
    const duplicate = effective.get(fingerprint)
    if (duplicate) local.push(`is effectively identical to ${JSON.stringify(duplicate)}`)
    else effective.set(fingerprint, fixture.id)

    failures.push(...local.map(message => `${label}: ${message}`))
  })

  if (failures.length > 0) {
    throw new Error(`Invalid eval fixtures:\n${failures.map(failure => `- ${failure}`).join("\n")}`)
  }
}

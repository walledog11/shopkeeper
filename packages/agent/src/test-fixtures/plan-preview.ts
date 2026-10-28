// Reply, refund and ask-operator plans the autonomy and preview suites decide on.
import { buildPlanSignals } from "../plan-signals.js"
import type { AgentPlan, OrgSettings, PlanStep, ProducedPlanSignalCode, RawToolCall } from "../types.js"

// Signals as the planner builds them: severity resolved against the plan's own
// tool calls, never hand-written by the test.
export function signalsFor(codes: ProducedPlanSignalCode[], rawToolCalls: RawToolCall[] = []) {
  return buildPlanSignals(codes, rawToolCalls)
}

export const sendReplyCall: RawToolCall = {
  id: "send_1",
  name: "send_reply",
  input: { text: "Yes, we ship to the UK." },
}

export const sendReplyStep: PlanStep = {
  id: "send_1",
  tool: "send_reply",
  label: "Notify customer",
  description: "Yes, we ship to the UK.",
  category: "communication",
  enabled: true,
}

export const refundStep: PlanStep = {
  id: "refund_1",
  tool: "create_refund",
  label: "Issue refund",
  description: "Refund $20",
  category: "action",
  enabled: true,
}

export const refundCall: RawToolCall = {
  id: "refund_1",
  name: "create_refund",
  input: { order_id: "9000", amount: "20.00", reason: "wrong size" },
}

export function plan(overrides: Partial<AgentPlan> = {}): AgentPlan {
  return {
    instruction: "Handle this",
    steps: [sendReplyStep],
    rawToolCalls: [sendReplyCall],
    ...overrides,
  }
}

export function refundPlan(refundOverrides: Partial<RawToolCall> = {}): AgentPlan {
  return {
    instruction: "Refund order",
    steps: [refundStep, sendReplyStep],
    rawToolCalls: [{ ...refundCall, ...refundOverrides }, sendReplyCall],
  }
}

export function settings(overrides: Partial<OrgSettings>): Partial<OrgSettings> {
  return { autoExecuteMode: "live", ...overrides }
}

const hollowRefundReplyCall: RawToolCall = {
  id: "send_1",
  name: "send_reply",
  input: { text: "I've issued a refund for order #4003." },
}

export function hollowRefundReplyPlan(overrides: Partial<AgentPlan> = {}): AgentPlan {
  return plan({
    instruction: "Refund order",
    rawToolCalls: [hollowRefundReplyCall],
    signals: signalsFor(["mutative_intent_no_action"]),
    ...overrides,
  })
}

export const askOperatorCall: RawToolCall = {
  id: "ask_1",
  name: "ask_operator",
  input: { question: "Do we ship to Canada, and at what rate?" },
}

const askOperatorStep: PlanStep = {
  id: "ask_1",
  tool: "ask_operator",
  label: "Ask the merchant",
  description: "Do we ship to Canada, and at what rate?",
  category: "internal",
  enabled: true,
}

export function askOperatorPlan(overrides: Partial<AgentPlan> = {}): AgentPlan {
  return {
    instruction: "Answer shipping question",
    steps: [askOperatorStep],
    rawToolCalls: [askOperatorCall],
    ...overrides,
  }
}

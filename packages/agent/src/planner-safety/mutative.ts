import type Anthropic from "@anthropic-ai/sdk"
import type { AgentContext } from "../agent-context.js"
import {
  customerMessageTexts,
  hasActionableMutativeIntent,
  hasContradictoryInstructionSignals,
  hasForwardedInjectionRefundSignal,
  hasMutativeRequestIntent,
  hasOutOfScopeCommercialRequestSignals,
  hasSuspectedFraudRefundSignals,
  looksLikeOrderStatusIntent,
  planningIntentTexts,
} from "../intent.js"
import {
  findReferencedOrder,
  ORDER_REFERENCE_RE,
} from "../order-reference.js"
import { resolveAgentSettings } from "../settings.js"
import { TOOL_CATEGORIES } from "../tools/registry/index.js"
import type { ToolStatus } from "../tools/result.js"
import type { OrgSettings, RawToolCall } from "../types.js"
import { refundTargetsAlreadyFullyRefunded } from "./refunds.js"

const ORDER_LOOKUP_TOOLS = new Set([
  "get_order_by_name",
  "get_shopify_orders",
  "get_shopify_customer",
  "search_shopify_customers",
])

export function hasCriticalPlanningReadErrorsForBlocks(
  readBlocks: readonly Anthropic.ToolUseBlock[],
  readStatusMap: ReadonlyMap<string, ToolStatus>,
): boolean {
  return readBlocks.some(
    block => ORDER_LOOKUP_TOOLS.has(block.name) && readStatusMap.get(block.id) === "error",
  )
}

export function hasAmbiguousCustomerSearchResult(
  readBlocks: readonly Anthropic.ToolUseBlock[],
  readResultsMap: ReadonlyMap<string, string>,
): boolean {
  for (const block of readBlocks) {
    if (block.name !== "search_shopify_customers") continue
    const raw = readResultsMap.get(block.id)
    if (!raw) continue
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 1) return true
    } catch {
      continue
    }
  }
  return false
}

export function shouldForcePlanningEscalation(input: {
  ctx: AgentContext
  instruction: string
  rawToolCalls: readonly RawToolCall[]
  readBlocks: readonly Anthropic.ToolUseBlock[]
  readStatusMap: ReadonlyMap<string, ToolStatus>
  readResultsMap: ReadonlyMap<string, string>
  settings?: OrgSettings
  operatorMode: boolean
}): boolean {
  if (input.operatorMode) return false
  if (input.rawToolCalls.some(toolCall => toolCall.name === "escalate_to_human")) return false

  const intentTexts = planningIntentTexts(input.ctx, input.instruction)
  const customerTexts = customerMessageTexts(input.ctx)
  if (hasSuspectedFraudRefundSignals(...customerTexts)) return true
  if (hasOutOfScopeCommercialRequestSignals(...customerTexts)) return true
  if (hasForwardedInjectionRefundSignal(...intentTexts)) return true
  if (hasContradictoryInstructionSignals(...intentTexts)) return true
  if (shouldEscalateFulfilledCancelRequest(input.ctx, input.instruction)) return true
  if (hasAmbiguousCustomerSearchResult(input.readBlocks, input.readResultsMap)) return true

  const resolvedSettings = resolveAgentSettings(input.settings)
  if (resolvedSettings.autonomyTier === "watch" && hasActionableMutativeIntent(...customerTexts)) {
    return true
  }
  if (!hasCriticalPlanningReadErrorsForBlocks(input.readBlocks, input.readStatusMap)) return false
  return hasActionableMutativeIntent(...customerTexts) || input.ctx.recentOrders.length === 0
}

function planHasActionTool(rawToolCalls: readonly RawToolCall[]): boolean {
  return rawToolCalls.some(toolCall => TOOL_CATEGORIES[toolCall.name] === "action")
}

function planHasEscalation(rawToolCalls: readonly RawToolCall[]): boolean {
  return rawToolCalls.some(toolCall => toolCall.name === "escalate_to_human")
}

export const MUTATIVE_INTENT_NO_ACTION_WARNING =
  "Customer requested a refund/cancel but no action was planned — review before sending."

export function shouldPreferBrandVoiceOrderStatusReply(
  ctx: AgentContext,
  instruction: string,
  settings?: OrgSettings,
): boolean {
  if (!resolveAgentSettings(settings).brandVoice?.trim()) return false
  const customerTexts = customerMessageTexts(ctx)
  if (hasActionableMutativeIntent(...customerTexts)) return false

  const intentTexts = planningIntentTexts(ctx, instruction)
  if (!intentTexts.some(text => looksLikeOrderStatusIntent(text))) return false
  if (ctx.recentOrders.length === 0) return false
  for (const text of intentTexts) {
    if (findReferencedOrder(ctx.recentOrders, text)) return true
    if (ORDER_REFERENCE_RE.test(text)) return false
  }
  return true
}

export function applyBrandVoiceOrderStatusGuard(
  ctx: AgentContext,
  instruction: string,
  settings: OrgSettings | undefined,
  rawToolCalls: RawToolCall[],
): RawToolCall[] {
  if (!shouldPreferBrandVoiceOrderStatusReply(ctx, instruction, settings)) return rawToolCalls
  return rawToolCalls.filter(toolCall => (
    toolCall.name !== "escalate_to_human" && TOOL_CATEGORIES[toolCall.name] !== "read"
  ))
}

export function shouldForceMutativeReplan(input: {
  ctx: AgentContext
  rawToolCalls: readonly RawToolCall[]
  tools: readonly { name: string }[]
  operatorMode: boolean
  ranReplan: boolean
}): boolean {
  if (input.operatorMode || input.ranReplan) return false
  if (!hasMutativeRequestIntent(...customerMessageTexts(input.ctx))) return false
  if (refundTargetsAlreadyFullyRefunded(input.ctx, "")) return false
  if (planHasActionTool(input.rawToolCalls) || planHasEscalation(input.rawToolCalls)) return false
  return input.tools.some(tool => TOOL_CATEGORIES[tool.name] === "action")
}

export function shouldSkipReplyDraftForMutativeIntent(
  ctx: AgentContext,
  rawToolCalls: readonly RawToolCall[],
): boolean {
  if (!hasMutativeRequestIntent(...customerMessageTexts(ctx))) return false
  if (refundTargetsAlreadyFullyRefunded(ctx, "")) return false
  if (planHasActionTool(rawToolCalls) || planHasEscalation(rawToolCalls)) return false
  return true
}

export function applyMutativeIntentNoActionGuard(
  ctx: AgentContext,
  rawToolCalls: RawToolCall[],
  warnings: string[],
): RawToolCall[] {
  if (!shouldSkipReplyDraftForMutativeIntent(ctx, rawToolCalls)) return rawToolCalls
  if (!warnings.includes(MUTATIVE_INTENT_NO_ACTION_WARNING)) {
    warnings.push(MUTATIVE_INTENT_NO_ACTION_WARNING)
  }
  return rawToolCalls.filter(toolCall => toolCall.name !== "send_reply")
}

export function shouldSkipReplyDraftForWatchTier(
  settings: OrgSettings | undefined,
  ctx: AgentContext,
): boolean {
  if (resolveAgentSettings(settings).autonomyTier !== "watch") return false
  return hasActionableMutativeIntent(...customerMessageTexts(ctx))
}

export function shouldEscalateFulfilledCancelRequest(
  ctx: AgentContext,
  instruction: string,
): boolean {
  const intentTexts = planningIntentTexts(ctx, instruction)
  const wantsCancel = intentTexts.some(text => /\bcancel(?:lation|led|ing)?\b/i.test(text))
  return wantsCancel && ctx.recentOrders.some(order => order.fulfillment_status === "fulfilled")
}

export function stripNonEscalationTerminalTools(rawToolCalls: RawToolCall[]): RawToolCall[] {
  return rawToolCalls.filter(toolCall => (
    toolCall.name === "escalate_to_human" || TOOL_CATEGORIES[toolCall.name] === "read"
  ))
}

export const ESCALATION_DRAFT_PROMPT =
  "Planning cannot proceed safely. Call escalate_to_human now — do not send_reply or take mutative action."

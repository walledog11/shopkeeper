import type Anthropic from "@anthropic-ai/sdk"
import type { AgentContext } from "../agent-context.js"
import { hasMerchantPolicyGapIntent } from "../intent.js"
import { kbArticlesCoverQuery } from "../planner-read-skip.js"
import type { RawToolCall } from "../types.js"

export const CIRCULAR_CHANNEL_DEFLECTION_WARNING =
  "Draft reply deflected the customer to a channel the agent already manages — replaced with ask_operator."

const MANAGED_CHANNEL_DEFLECTION_RES: readonly RegExp[] = [
  /\breach out to\b/i,
  /\bcontact us\b/i,
  /\bget in touch with\b/i,
  /\b(?:email|message|dm)\s+us\b/i,
  /\b(?:dm|message)\s+@[a-z0-9._]+\b/i,
  /\b(?:on|via|through)\s+instagram\b/i,
  /\bsupport@[a-z0-9.-]+\.[a-z]{2,}\b/i,
  /\bcontact\s+(?:support|the store)\b/i,
]

const SHIPPING_KB_SIGNAL_RES =
  /\b(international|worldwide|global|countries|regions|ship(?:ping)?|deliver)\b/i
const RETURN_KB_SIGNAL_RES = /\b(return|refund|exchange|restock)\b/i

function customerMessageTexts(ctx: AgentContext): string[] {
  return ctx.recentMessages
    .filter(message => message.senderType === "customer" && message.contentText?.trim())
    .map(message => message.contentText as string)
}

function sendReplyText(toolCall: RawToolCall): string | null {
  if (toolCall.name !== "send_reply") return null
  const input = toolCall.input
  if (!input || typeof input !== "object") return null
  const text = (input as Record<string, unknown>).text
  return typeof text === "string" ? text : null
}

export function sendReplyDeflectsToManagedChannels(toolCall: RawToolCall): boolean {
  const text = sendReplyText(toolCall)
  return Boolean(text && MANAGED_CHANNEL_DEFLECTION_RES.some(pattern => pattern.test(text)))
}

function parseKbArticlesFromSearchResult(raw: string): { title: string; body: string }[] {
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap(value => {
      if (!value || typeof value !== "object") return []
      const title = (value as Record<string, unknown>).title
      const body = (value as Record<string, unknown>).body
      if (typeof title !== "string" || typeof body !== "string") return []
      return [{ title, body }]
    })
  } catch {
    return []
  }
}

function kbArticlesAnswerPolicyQuestion(
  articles: readonly { title: string; body: string }[],
  ...texts: string[]
): boolean {
  if (articles.length === 0) return false
  const combined = texts.join(" ").toLowerCase()
  if (kbArticlesCoverQuery([...articles], texts.join(" "), null)) return true

  const wantsShipping = /\b(ship|deliver|international|worldwide|global|shopping globally)\b/i.test(combined)
  const wantsReturns = /\b(return|refund|exchange)\b/i.test(combined)
  if (!wantsShipping && !wantsReturns) return false

  return articles.some(article => {
    const blob = `${article.title} ${article.body}`
    return (wantsShipping && SHIPPING_KB_SIGNAL_RES.test(blob))
      || (wantsReturns && RETURN_KB_SIGNAL_RES.test(blob))
  })
}

export function kbCoversMerchantPolicyQuestion(input: {
  ctx: AgentContext
  readBlocks: readonly Anthropic.ToolUseBlock[]
  readResultsMap: ReadonlyMap<string, string>
  customerTexts: readonly string[]
}): boolean {
  if (kbArticlesAnswerPolicyQuestion(input.ctx.kbArticles, ...input.customerTexts)) return true
  for (const block of input.readBlocks) {
    if (block.name !== "search_kb") continue
    const raw = input.readResultsMap.get(block.id)
    if (!raw) continue
    if (kbArticlesAnswerPolicyQuestion(parseKbArticlesFromSearchResult(raw), ...input.customerTexts)) {
      return true
    }
  }
  return false
}

export function shouldPreferAskOperatorForPolicyGap(input: {
  ctx: AgentContext
  readBlocks: readonly Anthropic.ToolUseBlock[]
  readResultsMap: ReadonlyMap<string, string>
}): boolean {
  const customerTexts = customerMessageTexts(input.ctx)
  if (!hasMerchantPolicyGapIntent(...customerTexts)) return false
  return !kbCoversMerchantPolicyQuestion({ ...input, customerTexts })
}

export function shouldUsePolicyGapReplanPrompt(input: {
  ctx: AgentContext
  readBlocks: readonly Anthropic.ToolUseBlock[]
  readResultsMap: ReadonlyMap<string, string>
  rawToolCalls: readonly RawToolCall[]
}): boolean {
  if (input.rawToolCalls.some(toolCall => (
    toolCall.name === "ask_operator" || toolCall.name === "escalate_to_human"
  ))) {
    return false
  }
  if (!input.readBlocks.some(block => block.name === "search_kb")) return false
  return shouldPreferAskOperatorForPolicyGap(input)
}

export function buildPolicyGapAskOperatorCall(ctx: AgentContext): RawToolCall {
  const customerTexts = customerMessageTexts(ctx)
  const latest = customerTexts[customerTexts.length - 1]?.trim() ?? "this question"
  return {
    id: "tu_policy_gap_ask",
    name: "ask_operator",
    input: { question: `What should I tell the customer about: "${latest}"?` },
  }
}

export function stripCircularChannelDeflectionReplies(
  rawToolCalls: RawToolCall[],
  warnings: string[],
): RawToolCall[] {
  if (!rawToolCalls.some(sendReplyDeflectsToManagedChannels)) return rawToolCalls
  if (!warnings.includes(CIRCULAR_CHANNEL_DEFLECTION_WARNING)) {
    warnings.push(CIRCULAR_CHANNEL_DEFLECTION_WARNING)
  }
  return rawToolCalls.filter(toolCall => !sendReplyDeflectsToManagedChannels(toolCall))
}

export function applyPolicyGapAskOperatorGuard(input: {
  ctx: AgentContext
  rawToolCalls: RawToolCall[]
  readBlocks: readonly Anthropic.ToolUseBlock[]
  readResultsMap: ReadonlyMap<string, string>
  warnings: string[]
}): RawToolCall[] {
  const rawToolCalls = stripCircularChannelDeflectionReplies(input.rawToolCalls, input.warnings)
  const hasTerminalOperatorAction = rawToolCalls.some(toolCall => (
    toolCall.name === "ask_operator" || toolCall.name === "escalate_to_human"
  ))
  if (hasTerminalOperatorAction) return rawToolCalls

  const shouldAsk = shouldPreferAskOperatorForPolicyGap(input)
  const hasSendReply = rawToolCalls.some(toolCall => toolCall.name === "send_reply")
  if (hasSendReply && !shouldAsk) return rawToolCalls
  if (!shouldAsk) return rawToolCalls
  return [
    ...rawToolCalls.filter(toolCall => toolCall.name !== "send_reply"),
    buildPolicyGapAskOperatorCall(input.ctx),
  ]
}

export function replyDraftPrompt(settings?: { brandVoice?: string | null }): string {
  if (!settings?.brandVoice?.trim()) {
    return "Now call send_reply to respond to the customer."
  }
  return "Now call send_reply to respond to the customer. Follow the brand voice section exactly, including any banned phrases or tone constraints."
}

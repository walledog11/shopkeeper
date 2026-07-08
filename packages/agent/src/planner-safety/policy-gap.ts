import type { RawToolCall } from "../types.js"

export const CIRCULAR_CHANNEL_DEFLECTION_WARNING =
  "Draft reply deflected the customer to a channel the agent already manages — review before sending."

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

export function replyDraftPrompt(settings?: { brandVoice?: string | null }): string {
  if (!settings?.brandVoice?.trim()) {
    return "Now call send_reply to respond to the customer."
  }
  return "Now call send_reply to respond to the customer. Follow the brand voice section exactly, including any banned phrases or tone constraints."
}

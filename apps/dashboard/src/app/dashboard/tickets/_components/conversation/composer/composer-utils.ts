import type { CannedResponse } from "@/types"

export const EMPTY_CANNED_RESPONSES: CannedResponse[] = []

export function isInstagramReplyWindowExpired({
  channelType,
  isAgentMode,
  isNoteTab,
  lastCustomerMessageAt,
  nowMs = Date.now(),
}: {
  channelType?: string
  isAgentMode: boolean
  isNoteTab: boolean
  lastCustomerMessageAt?: string | null
  nowMs?: number
}) {
  return channelType === "ig_dm" &&
    !isNoteTab &&
    !isAgentMode &&
    (!lastCustomerMessageAt || nowMs - new Date(lastCustomerMessageAt).getTime() > 24 * 60 * 60 * 1000)
}

export function filterCannedResponses(
  cannedResponses: CannedResponse[],
  slashQuery: string | null,
  channelType?: string,
) {
  if (slashQuery === null) return EMPTY_CANNED_RESPONSES
  const q = slashQuery.toLowerCase()
  return cannedResponses.filter((response) => {
    const matchesQuery = !q || response.title.toLowerCase().includes(q) || response.body.toLowerCase().includes(q)
    const matchesChannel = response.channels.length === 0 || !channelType || response.channels.includes(channelType)
    return matchesQuery && matchesChannel
  })
}

export function buildCannedResponseBody(
  response: CannedResponse,
  context: {
    customerFirstName?: string | null
    orderName?: string | null
    storeName?: string | null
  },
) {
  let body = response.body
  if (context.customerFirstName) {
    body = body.replace(/{{customer_name}}/g, context.customerFirstName)
  }
  if (context.orderName) {
    body = body.replace(/{{order_number}}/g, context.orderName)
  }
  if (context.storeName) {
    body = body.replace(/{{store_name}}/g, context.storeName)
  }
  return body
}

export function insertCannedResponseValue(value: string, body: string) {
  const hadSlash = /(^|\s)\/\S*$/.test(value)
  return hadSlash
    ? value.replace(/(^|\s)\/\S*$/, (match) => {
        const prefix = match.match(/^\s/) ? match[0] : ""
        return prefix + body
      })
    : value + (value && !value.endsWith(" ") && !value.endsWith("\n") ? " " : "") + body
}

export function buildComposerPlaceholder({
  agentName,
  customerName,
  isMobile,
  isNoteTab,
}: {
  agentName: string
  customerName: string
  isMobile: boolean
  isNoteTab: boolean
}) {
  const placeholderParts = isNoteTab
    ? ["Add a private note for your team", ...(isMobile ? [] : ["⌘↵ to send"])]
    : [
        `Reply to ${customerName}…`,
        `type @${agentName.toLowerCase()} to invoke ${agentName}`,
        ...(isMobile ? [] : ["⌘↵ to send"]),
      ]
  return placeholderParts.join("  ·  ")
}

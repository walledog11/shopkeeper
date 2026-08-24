import { AGENT_DISPLAY_NAME } from "@shopkeeper/agent/settings"

export function isInstagramReplyWindowExpired({
  channelType,
  isAgentMode,
  lastCustomerMessageAt,
  nowMs = Date.now(),
}: {
  channelType?: string
  isAgentMode: boolean
  lastCustomerMessageAt?: string | null
  nowMs?: number
}) {
  return channelType === "ig_dm" &&
    !isAgentMode &&
    (!lastCustomerMessageAt || nowMs - new Date(lastCustomerMessageAt).getTime() > 24 * 60 * 60 * 1000)
}

export function buildComposerPlaceholder({
  customerName,
  isMobile,
}: {
  customerName: string
  isMobile: boolean
}) {
  const placeholderParts = [
    `Reply to ${customerName}…`,
    `type @${AGENT_DISPLAY_NAME.toLowerCase()} to invoke ${AGENT_DISPLAY_NAME}`,
    ...(isMobile ? [] : ["⌘↵ to send"]),
  ]
  return placeholderParts.join("  ·  ")
}

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
  const mention = `@${AGENT_DISPLAY_NAME.toLowerCase()}`
  // One line on a phone: the shortcut and the long form of the hint wrap there.
  if (isMobile) return `Reply to ${customerName}… or type ${mention}`
  return [
    `Reply to ${customerName}…`,
    `type ${mention} to ask ${AGENT_DISPLAY_NAME}`,
    "⌘↵ to send",
  ].join("  ·  ")
}

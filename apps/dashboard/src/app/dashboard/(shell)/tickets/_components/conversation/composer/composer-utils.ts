import { AGENT_DISPLAY_NAME } from "@shopkeeper/agent/settings"

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

export function buildComposerPlaceholder({
  customerName,
  isMobile,
  isNoteTab,
}: {
  customerName: string
  isMobile: boolean
  isNoteTab: boolean
}) {
  const placeholderParts = isNoteTab
    ? ["Add a private note for your team", ...(isMobile ? [] : ["⌘↵ to send"])]
    : [
        `Reply to ${customerName}…`,
        `type @${AGENT_DISPLAY_NAME.toLowerCase()} to invoke ${AGENT_DISPLAY_NAME}`,
        ...(isMobile ? [] : ["⌘↵ to send"]),
      ]
  return placeholderParts.join("  ·  ")
}

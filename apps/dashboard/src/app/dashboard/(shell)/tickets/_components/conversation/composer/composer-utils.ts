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

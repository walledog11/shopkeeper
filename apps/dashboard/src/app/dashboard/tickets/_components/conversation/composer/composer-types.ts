export interface IntegrationRow {
  platform: string
  fromEmail?: string | null
  externalAccountId: string
}

export interface ComposerProps {
  customerName: string
  agentName?: string
  channelType?: string
  shopifyCustomerId?: string | null
  customerPlatformId?: string
  lastCustomerMessageAt?: string | null
  value: string
  isClerkMode?: boolean
  viewTab: "chat" | "notes"
  noteCount: number
  onViewTabChange: (tab: "chat" | "notes") => void
  isSending: boolean
  error: string | null
  onChange: (text: string) => void
  onClearClerk?: () => void
  onSend: (isNote: boolean) => void
}

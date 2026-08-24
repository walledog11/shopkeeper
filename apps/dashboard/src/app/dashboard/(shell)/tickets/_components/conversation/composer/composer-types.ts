export interface IntegrationRow {
  platform: string
  fromEmail?: string | null
  externalAccountId: string
}

export interface ComposerProps {
  customerName: string
  channelType?: string
  shopifyCustomerId?: string | null
  customerPlatformId?: string
  lastCustomerMessageAt?: string | null
  value: string
  isAgentMode?: boolean
  isSending: boolean
  error: string | null
  onChange: (text: string) => void
  onClearAgentMode?: () => void
  onSend: (isNote: boolean) => void
  showComposerInput?: boolean
}

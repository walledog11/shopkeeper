import type { ComposerAttachments } from "../../../_hooks/useComposerAttachments"

export interface IntegrationRow {
  platform: string
  fromEmail?: string | null
  externalAccountId: string
}

export interface ComposerProps {
  customerName: string
  // Optional: the mobile plan-edit surface reuses this shape to revise an
  // agent draft, a flow that never attaches files.
  attachments?: ComposerAttachments
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

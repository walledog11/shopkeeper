import type { createMessage } from "@shopkeeper/db"
import type { OutboundSource } from "@/lib/server/outbound-recorder"
import type { ReplySource } from "@shopkeeper/analytics"

export interface DispatchThread {
  id: string
  channelType: string
  externalSpaceId?: string | null
  organizationId: string
  customer: { platformId: string }
}

export interface DispatchOrg {
  id: string
  name: string
}

export type DispatchSource = Extract<
  OutboundSource,
  "dispatch_message" | "agent_send_reply" | "auto_ack"
>

export interface DispatchMessageOptions {
  analyticsReplySource?: ReplySource
  source?: DispatchSource
  emailSubjectFallback?: string
  // Stored `blob:` refs, already checked for org ownership by the caller.
  // Email is the only channel that carries them; see `attachmentsUnsupported`.
  attachments?: string[]
}

export type Message = Awaited<ReturnType<typeof createMessage>>

// `code` distinguishes refusals a caller can act on from generic provider
// errors. `episode_superseded` means the text was drafted against a conversation
// that has since ended: the send is refused rather than rerouted, because the
// draft was written from context the customer has already moved past.
export type DispatchFailureCode = "episode_superseded"

export type DispatchFailure = {
  ok: false
  error: string
  detail?: string
  providerStatus?: number
  code?: DispatchFailureCode
}

export type DispatchMessageResult =
  | { ok: true; message: Message }
  | DispatchFailure

export type DispatchProviderResult =
  | {
      ok: true
      integrationId?: string
      providerMessageId?: string
      providerRecipientId?: string | null
    }
  | DispatchFailure

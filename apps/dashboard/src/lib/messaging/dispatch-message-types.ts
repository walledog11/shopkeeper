import type { createMessage } from "@shopkeeper/db"
import type { OutboundSource } from "@/lib/server/outbound-recorder"

export interface DispatchThread {
  id: string
  channelType: string
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
  source?: DispatchSource
  emailSubjectFallback?: string
}

export type Message = Awaited<ReturnType<typeof createMessage>>

export type DispatchFailure = { ok: false; error: string; detail?: string; providerStatus?: number }

export type DispatchMessageResult =
  | { ok: true; message: Message }
  | DispatchFailure

export type DispatchProviderResult = { ok: true } | DispatchFailure

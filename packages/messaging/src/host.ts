import type { ReplySource } from "@shopkeeper/analytics"

export interface InstagramSendFailure {
  detail: string
  integrationId: string | null
  organizationId: string
  threadId: string
  transport?: "meta" | "socialapi"
}

/**
 * What a sending app supplies: where a provider failure is counted and paged,
 * and where a delivered reply is reported. The sending itself is shared.
 */
export interface MessagingHost {
  recordInstagramSendFailure(failure: InstagramSendFailure): Promise<void>
  captureReplySent(event: {
    channel: string
    messageId: string
    organizationId: string
    replySource: ReplySource
  }): Promise<void>
}

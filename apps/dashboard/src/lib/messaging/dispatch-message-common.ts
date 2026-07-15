import { createMessage, db, SenderType } from "@shopkeeper/db"
import { THREAD_STATUS } from "@shopkeeper/agent/thread-constants"
import type { DispatchThread } from "./dispatch-message-types"

export function createSentAgentMessage(
  thread: DispatchThread,
  text: string,
  integrationId?: string,
  providerMessageId?: string,
) {
  return createMessage(
    {
      threadId: thread.id,
      senderType: SenderType.agent,
      contentText: text,
      ...(integrationId && { integrationId }),
      ...(providerMessageId && { providerMessageId }),
    },
    { status: THREAD_STATUS.OPEN },
  )
}

export function createPendingAgentMessage(
  thread: DispatchThread,
  text: string,
  integrationId: string,
) {
  return createMessage(
    {
      threadId: thread.id,
      senderType: SenderType.agent,
      contentText: text,
      integrationId,
      sendStatus: "pending",
    },
    { status: THREAD_STATUS.OPEN },
  )
}

export function markAgentMessageSendFailed(messageId: string, sendError: string) {
  return db.message.update({
    where: { id: messageId },
    data: { sendStatus: "failed", sendClaimToken: null, sendError },
  })
}

import { createMessage, db, SenderType } from "@shopkeeper/db"
import { THREAD_STATUS } from "@shopkeeper/agent/thread-constants"
import type { DispatchThread } from "./dispatch-message-types"

interface AgentMessageAttribution {
  agentRequestId?: string
  agentTaskId?: string
}

// Sending on a thread normally brings it back into the inbox — a merchant
// answering a resolved ticket wants it open again. The one exception is a thread
// a conversation boundary ended: its successor is already open, and reopening it
// would put two open threads on one customer/channel, which is exactly what
// threads_one_open_per_customer forbids. So the reopen is conditional now rather
// than unconditional.
async function reopenPatchFor(threadId: string) {
  const current = await db.thread.findUnique({
    where: { id: threadId },
    select: { status: true, closedReason: true },
  })
  const supersededByRollover =
    current?.status === THREAD_STATUS.CLOSED && current.closedReason === "episode_rollover"
  return supersededByRollover ? {} : { status: THREAD_STATUS.OPEN }
}

export async function createSentAgentMessage(
  thread: DispatchThread,
  text: string,
  integrationId?: string,
  providerMessageId?: string,
  attachments: string[] = [],
  attribution: AgentMessageAttribution = {},
) {
  return createMessage(
    {
      threadId: thread.id,
      senderType: SenderType.agent,
      contentText: text,
      ...(integrationId && { integrationId }),
      ...(providerMessageId && { providerMessageId }),
      ...(attachments.length > 0 && { attachments }),
      ...(attribution.agentRequestId && { agentRequestId: attribution.agentRequestId }),
      ...(attribution.agentTaskId && { agentTaskId: attribution.agentTaskId }),
    },
    await reopenPatchFor(thread.id),
  )
}

// The refs ride on the row rather than the queue payload: the gateway job
// carries ids only, and a retry re-reads the row, so an attached reply survives
// a manual retry without the queue having to remember anything.
export async function createPendingAgentMessage(
  thread: DispatchThread,
  text: string,
  integrationId: string,
  attachments: string[] = [],
  attribution: AgentMessageAttribution = {},
) {
  return createMessage(
    {
      threadId: thread.id,
      senderType: SenderType.agent,
      contentText: text,
      integrationId,
      sendStatus: "pending",
      ...(attachments.length > 0 && { attachments }),
      ...(attribution.agentRequestId && { agentRequestId: attribution.agentRequestId }),
      ...(attribution.agentTaskId && { agentTaskId: attribution.agentTaskId }),
    },
    await reopenPatchFor(thread.id),
  )
}

/** Persist the logical response before a synchronous provider attempt. */
export async function createPendingLogicalResponse(
  thread: DispatchThread,
  text: string,
  attachments: string[] = [],
  attribution: AgentMessageAttribution = {},
) {
  return createMessage(
    {
      threadId: thread.id,
      senderType: SenderType.agent,
      contentText: text,
      sendStatus: "pending",
      ...(attachments.length > 0 && { attachments }),
      ...(attribution.agentRequestId && { agentRequestId: attribution.agentRequestId }),
      ...(attribution.agentTaskId && { agentTaskId: attribution.agentTaskId }),
    },
    await reopenPatchFor(thread.id),
  )
}

export function markLogicalResponseSent(
  messageId: string,
  integrationId?: string,
  providerMessageId?: string,
) {
  return db.message.update({
    where: { id: messageId },
    data: {
      sendStatus: "sent",
      sendError: null,
      ...(integrationId && { integrationId }),
      ...(providerMessageId && { providerMessageId }),
    },
  })
}

/** Mark the durable boundary before a synchronous provider request can start. */
export async function markLogicalResponseAttempted(messageId: string) {
  const result = await db.message.updateMany({
    where: { id: messageId, sendStatus: "pending", sendAttemptedAt: null },
    data: { sendAttemptedAt: new Date() },
  })
  if (result.count !== 1) throw new Error("Logical response is no longer pending for dispatch")
}

export function markAgentMessageSendFailed(messageId: string, sendError: string) {
  return db.message.update({
    where: { id: messageId },
    data: { sendStatus: "failed", sendClaimToken: null, sendError },
  })
}

export function markPendingAgentMessageSendUnknown(messageId: string, sendError: string) {
  return db.message.updateMany({
    where: { id: messageId, sendStatus: "pending" },
    data: { sendStatus: "unknown", sendClaimToken: null, sendError },
  })
}

import { db } from "@shopkeeper/db"
import { CHANNEL_TYPE } from "@shopkeeper/agent/thread-constants"
import { enqueueOutboundImessage } from "@/lib/messaging/enqueue-outbound-imessage"
import {
  createPendingAgentMessage,
  markAgentMessageSendFailed,
} from "./dispatch-message-common"
import type {
  DispatchMessageResult,
  DispatchOrg,
  DispatchSource,
  DispatchThread,
} from "./dispatch-message-types"

// Dashboard records the pending message, then hands Spectrum delivery to the
// gateway queue. iMessage has no synchronous provider fallback.
export async function dispatchImessageViaGatewayQueue(
  thread: DispatchThread,
  org: DispatchOrg,
  text: string,
  source: DispatchSource,
): Promise<DispatchMessageResult> {
  const [integration, threadRow] = await Promise.all([
    db.integration.findFirst({
      where: { organizationId: org.id, platform: CHANNEL_TYPE.IMESSAGE },
    }),
    db.thread.findUnique({ where: { id: thread.id }, select: { externalSpaceId: true } }),
  ])
  if (!integration) return { ok: false, error: "No iMessage integration configured" }

  // Inbound-first: never open a cold iMessage conversation. Without a stored
  // Space id the customer never messaged us on iMessage, so there is nothing to
  // reply into — refuse rather than cold-start (Apple bans lines for cold or
  // proactive outbound).
  if (!threadRow?.externalSpaceId?.trim()) {
    return { ok: false, error: "No inbound iMessage conversation to reply into" }
  }

  const message = await createPendingAgentMessage(thread, text)

  const enqueued = await enqueueOutboundImessage({
    organizationId: org.id,
    messageId: message.id,
    threadId: thread.id,
    integrationId: integration.id,
    source,
  })

  if (!enqueued) {
    await markAgentMessageSendFailed(message.id, "Could not queue iMessage send")
    return { ok: false, error: "Could not queue iMessage send" }
  }

  return { ok: true, message }
}

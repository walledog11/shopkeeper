import { CHANNEL_TYPE } from "@shopkeeper/agent/thread-constants"
import { isOutboundEmailAsyncEnabled } from "@/lib/messaging/enqueue-outbound-email"
import { createSentAgentMessage } from "./dispatch-message-common"
import {
  dispatchEmailViaGatewayQueue,
  sendEmailSynchronously,
} from "./email-dispatch"
import { dispatchImessageViaGatewayQueue } from "./imessage-dispatch"
import { dispatchInstagramDirect } from "./instagram-dispatch"
import type {
  DispatchMessageOptions,
  DispatchMessageResult,
  DispatchOrg,
  DispatchThread,
} from "./dispatch-message-types"

export type { DispatchMessageResult } from "./dispatch-message-types"

/**
 * Dispatches text to the customer via the thread's channel, then saves
 * the message to DB and sets the thread status to open.
 * Returns { ok: true, message } on success, { ok: false, error } on failure.
 *
 * Email and iMessage async paths intentionally hand provider delivery to the
 * gateway queue while preserving this dashboard-facing API.
 */
export async function dispatchMessage(
  thread: DispatchThread,
  org: DispatchOrg,
  text: string,
  options: DispatchMessageOptions = {},
): Promise<DispatchMessageResult> {
  const source = options.source ?? "dispatch_message"
  const isEmailChannel =
    thread.channelType === CHANNEL_TYPE.EMAIL || thread.channelType === CHANNEL_TYPE.SHOPIFY

  if (isEmailChannel && isOutboundEmailAsyncEnabled()) {
    return dispatchEmailViaGatewayQueue(thread, org, text, source)
  }

  if (thread.channelType === CHANNEL_TYPE.IMESSAGE) {
    return dispatchImessageViaGatewayQueue(thread, org, text, source)
  }

  const providerResult = thread.channelType === CHANNEL_TYPE.IG_DM
    ? await dispatchInstagramDirect(thread, org, text, source)
    : thread.channelType === CHANNEL_TYPE.EMAIL
      ? await sendEmailSynchronously(thread, org, text, {
        source,
        subjectFallback: options.emailSubjectFallback,
      })
      : thread.channelType === CHANNEL_TYPE.SHOPIFY
        ? await sendEmailSynchronously(thread, org, text, {
          source,
          subjectFallback: options.emailSubjectFallback,
          originalChannel: CHANNEL_TYPE.SHOPIFY,
        })
        : { ok: false as const, error: "Unsupported channel" }

  if (!providerResult.ok) return providerResult

  const message = await createSentAgentMessage(thread, text)
  return { ok: true, message }
}

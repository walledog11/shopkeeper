import { resolveAgentSettings } from "@shopkeeper/agent/settings"
import { db } from "@shopkeeper/db"
import { assertBillingWriteAllowed } from "@shopkeeper/db/billing-write-gate"
import type {
  DispatchFailure,
  DispatchMessageOptions,
  DispatchMessageResult,
  DispatchOrg,
  DispatchThread,
} from "./types.js"

// The storefront widget's waiting notice, so a customer handed to a person reads
// the same promise on every messaging channel. In the agent's own voice, and not
// a thank-you: the reply that follows the merchant's decision thanks them.
const HANDOFF_ACKNOWLEDGEMENT = "Got it. I'm looking into this and will get back to you here shortly."

/** `after_hours` sends the merchant's configured message; `handoff` tells a
 * messaging-channel customer that a person is looking at their message. */
export type AutoAckKind = "after_hours" | "handoff"

/** The thread, its customer and the organization an acknowledgement needs. */
export function loadAutoAckThread(threadId: string) {
  return db.thread.findUnique({
    where: { id: threadId },
    include: {
      customer: true,
      organization: { select: { id: true, name: true, settings: true, stripeStatus: true } },
    },
  })
}

export type AutoAckThread = NonNullable<Awaited<ReturnType<typeof loadAutoAckThread>>>

export interface AutoAckSenders {
  acknowledge(
    thread: DispatchThread,
    org: DispatchOrg,
    text: string,
  ): Promise<DispatchFailure | { ok: true; skipped: boolean }>
  dispatch(
    thread: DispatchThread,
    org: DispatchOrg,
    text: string,
    options: DispatchMessageOptions,
  ): Promise<DispatchMessageResult>
}

/** Sends the customer an automatic acknowledgement, unless there is nothing to send. */
export async function sendAutoAcknowledgement(
  thread: AutoAckThread,
  kind: AutoAckKind,
  senders: AutoAckSenders,
): Promise<DispatchFailure | { ok: true; skipped: boolean }> {
  const org = thread.organization
  assertBillingWriteAllowed(org)

  if (kind === "handoff") {
    return senders.acknowledge(thread, org, HANDOFF_ACKNOWLEDGEMENT)
  }

  const settings = resolveAgentSettings(org.settings as Parameters<typeof resolveAgentSettings>[0])
  // Guard: empty message means misconfiguration — the gateway decides when to send one.
  if (!settings.autoAckMessage.trim()) {
    return { ok: true, skipped: true }
  }

  const result = await senders.dispatch(thread, org, settings.autoAckMessage, { source: "auto_ack" })
  return result.ok ? { ok: true, skipped: false } : result
}

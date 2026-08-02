import { ThreadFilterFeedback, ThreadFilterStatus, db } from "@shopkeeper/db"

export interface MerchantRepliedThread {
  id: string
  filterStatus: ThreadFilterStatus
  escalatedAt: Date | null
}

/**
 * Thread state that changes because the *merchant* replied, not the agent.
 * Both outbound merchant paths — the dashboard composer and `REPLY <n>` from
 * the operator digest — go through here; the agent's own sends must not.
 *
 * - A reply on a non-genuine thread means the merchant treats it as legitimate.
 * - A reply on an escalated thread discharges the agent's handoff. Without
 *   this the ticket sits in "Flagged for you" until it is closed, so the
 *   section never drains on the thing that actually resolved it.
 */
export async function recordMerchantReply(thread: MerchantRepliedThread): Promise<void> {
  const promoteFilter = thread.filterStatus !== ThreadFilterStatus.genuine
  const clearEscalation = thread.escalatedAt !== null
  if (!promoteFilter && !clearEscalation) return

  await db.thread.update({
    where: { id: thread.id },
    data: {
      ...(promoteFilter && {
        filterFeedback: ThreadFilterFeedback.confirmed_genuine,
        ...(thread.filterStatus === ThreadFilterStatus.filtered && {
          filterStatus: ThreadFilterStatus.genuine,
        }),
      }),
      ...(clearEscalation && { escalatedAt: null }),
    },
  })
}

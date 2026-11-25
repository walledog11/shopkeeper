import { db } from "@shopkeeper/db"
import { getCurrentPlanForThread } from "@shopkeeper/agent/plan-cache-shape"
import { canonicalInboxThreadSql } from "@/lib/messaging/inbox-filter"
import {
  inboxRowDecision,
  isActionDecision,
  type InboxDecisionInput,
  type InboxRowDecision,
} from "@/app/dashboard/(shell)/tickets/_lib/inbox-row"
import type {
  AgentPlan,
  ChannelType,
  OrgSettings,
  SenderType,
  ThreadRequestDisposition,
  ThreadStatus,
  Ticket,
} from "@/types"

type CandidateRow = {
  id: string
  status: ThreadStatus
  filter_status: Ticket["filterStatus"]
  channel_type: ChannelType
  request_disposition: ThreadRequestDisposition | null
  escalated_at: Date | null
  cached_plan: unknown
  cached_plan_message_id: string | null
  latest_message_id: string | null
  latest_sender_type: SenderType | null
}

export interface NeedsYouThread {
  id: string
  decision: Exclude<InboxRowDecision, "trust">
  /** The cached plan while it is current; an escalation can have none. */
  plan: AgentPlan | null
}

/**
 * Every open inbox ticket that needs the merchant, newest first, decided by the
 * inbox's own row rule (`inboxRowDecision`), so every count of this work agrees
 * with the inbox. Only a thread with a cached plan or an escalation can need
 * them, so the query reads just those, each with its newest conversation message.
 */
export async function loadNeedsYouThreads(
  organizationId: string,
  settings: Partial<OrgSettings> | null,
): Promise<NeedsYouThread[]> {
  const rows = await db.$queryRaw<CandidateRow[]>`
    SELECT
      t.id, t.status, t.filter_status, t.channel_type, t.request_disposition,
      t.escalated_at, t.cached_plan, t.cached_plan_message_id,
      latest.id AS latest_message_id, latest.sender_type AS latest_sender_type
    FROM threads t
    LEFT JOIN LATERAL (
      SELECT m.id, m.sender_type
      FROM messages m
      WHERE m.thread_id = t.id
        AND m.deleted_at IS NULL
        AND m.sender_type <> 'note'
      ORDER BY m.sent_at DESC, m.id DESC
      LIMIT 1
    ) latest ON TRUE
    WHERE ${canonicalInboxThreadSql(organizationId)}
      AND t.status = 'open'
      AND (t.cached_plan IS NOT NULL OR t.escalated_at IS NOT NULL)
    ORDER BY t.last_message_at DESC, t.id DESC
  `

  return rows.flatMap((row) => {
    const latest = row.latest_message_id && row.latest_sender_type
      ? { id: row.latest_message_id, sender: row.latest_sender_type }
      : null
    const thread: InboxDecisionInput = {
      status: row.status,
      filterStatus: row.filter_status,
      channelType: row.channel_type,
      requestDisposition: row.request_disposition,
      escalatedAt: row.escalated_at,
      cachedPlan: row.cached_plan,
      cachedPlanMessageId: row.cached_plan_message_id,
      messages: latest ? [latest] : [],
    }
    const decision = inboxRowDecision(thread, settings)
    if (!isActionDecision(decision)) return []
    return [{
      id: row.id,
      decision,
      plan: getCurrentPlanForThread(thread, latest ? [{ id: latest.id, senderType: latest.sender }] : []),
    }]
  })
}

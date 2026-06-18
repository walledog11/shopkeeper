import { db, SenderType } from "@shopkeeper/db"
import type { ChannelType, OrgSettings } from "@/types"
import { getCurrentPlanForThread } from "@shopkeeper/agent/plan-cache-shape"
import { buildPlanPreview, classifyHomePlan, planReplyText } from "@shopkeeper/agent/plan-preview"
import {
  HOME_NEEDS_ATTENTION_LIMIT,
  type HomeNeedsAttentionItem,
} from "@/lib/home/summary-contract"
import { canonicalInboxThreadWhere } from "@/lib/messaging/inbox-filter"
import { getChannelInfo } from "@/lib/messaging/channels"
import { realCustomerName, timeAgoShort } from "@/lib/messaging/customer-display"
import { currentPlanPredicate, type ThreadIdRow } from "@/lib/server/home-summary-queries"

function clampCustomerMessage(text: string | null, max = 300): string {
  const cleaned = (text ?? "").trim()
  return cleaned.length > max ? `${cleaned.slice(0, max - 1)}…` : cleaned
}

export async function loadNeedsAttention(
  organizationId: string,
  settings: Partial<OrgSettings> | null,
  now: Date,
): Promise<HomeNeedsAttentionItem[]> {
  const rows = await db.$queryRaw<ThreadIdRow[]>`
    SELECT t.id
    FROM threads t
    WHERE ${currentPlanPredicate(organizationId)}
    ORDER BY t.last_message_at DESC, t.id DESC
    LIMIT ${HOME_NEEDS_ATTENTION_LIMIT}
  `

  if (rows.length === 0) return []

  const ids = rows.map(row => row.id)
  const threads = await db.thread.findMany({
    where: {
      ...canonicalInboxThreadWhere(organizationId),
      id: { in: ids },
      status: "open",
    },
    include: {
      customer: true,
      messages: {
        where: { senderType: { not: SenderType.note }, deletedAt: null },
        orderBy: [{ sentAt: "desc" }, { id: "desc" }],
        take: 1,
      },
    },
  })
  const byId = new Map(threads.map(thread => [thread.id, thread]))

  const customerIds = [...new Set(threads.map(thread => thread.customerId))]
  const threadCounts = await db.thread.groupBy({
    by: ["customerId"],
    where: {
      ...canonicalInboxThreadWhere(organizationId),
      customerId: { in: customerIds },
      status: { in: ["open", "closed"] },
    },
    _count: { _all: true },
  })
  const vipCustomerIds = new Set(
    threadCounts.filter(row => row._count._all >= 3).map(row => row.customerId),
  )

  return ids.flatMap((id) => {
    const thread = byId.get(id)
    const latestMessage = thread?.messages[0]
    if (!thread || !latestMessage) return []

    const plan = getCurrentPlanForThread(thread, thread.messages)
    if (!plan) return []

    const copy = buildPlanPreview(plan, thread.aiSummary, latestMessage.contentText)
    const classification = classifyHomePlan(plan, settings, {
      filterStatus: thread.filterStatus,
    })
    const kind: HomeNeedsAttentionItem["kind"] =
      classification.kind === "quick_reply" ? "quick_reply" : "needs_review"

    return [{
      threadId: thread.id,
      kind,
      customerName: realCustomerName(thread.customer),
      customerMessage: clampCustomerMessage(latestMessage.contentText),
      channelName: getChannelInfo(thread.channelType as ChannelType).name,
      timeAgo: timeAgoShort(latestMessage.sentAt, now),
      headline: thread.aiTitle?.trim() || copy.headline,
      contextLine: copy.context,
      proposalSummary: copy.proposal,
      actionText: copy.actionText,
      replyText: planReplyText(plan),
      orderRef: copy.orderRef,
      tag: thread.tag,
      isVip: vipCustomerIds.has(thread.customerId),
    }]
  })
}

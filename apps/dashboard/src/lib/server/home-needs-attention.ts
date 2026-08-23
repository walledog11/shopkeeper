import { db, SenderType } from "@shopkeeper/db"
import type { ChannelType, OrgSettings } from "@/types"
import { getCurrentPlanForThread } from "@shopkeeper/agent/plan-cache-shape"
import { decideAutonomy } from "@shopkeeper/agent/autonomy"
import {
  buildPlanPreview,
  buildHomeActionDisplay,
  planReplyText,
} from "@shopkeeper/agent/plan-preview"
import {
  HOME_NEEDS_ATTENTION_LIMIT,
  type HomeNeedsAttentionItem,
} from "@/lib/home/summary-contract"
import { canonicalInboxThreadWhere } from "@/lib/messaging/inbox-filter"
import { getChannelInfo } from "@/lib/messaging/channels"
import { customerDisplayLabel, timeAgoShort } from "@/lib/messaging/customer-display"
import { currentPlanPredicate, type ThreadIdRow } from "@/lib/server/home-summary-queries"

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
    const verdict = decideAutonomy(plan, settings, {
      filterStatus: thread.filterStatus,
    })
    const kind: HomeNeedsAttentionItem["kind"] =
      verdict.kind === "quick_reply" ? "quick_reply"
        : verdict.kind === "needs_merchant_input" ? "needs_merchant_input"
          : verdict.kind === "invalid" ? "invalid"
          : "needs_review"

    return [{
      threadId: thread.id,
      kind,
      // Real name, else the email/handle they wrote in from. Null only when the
      // customer record carries neither — "Unknown Customer" is not worth showing.
      customerName: thread.customer?.name || thread.customer?.platformId
        ? customerDisplayLabel(thread.customer)
        : null,
      customerMessage: (latestMessage.contentText ?? "").trim(),
      channelName: getChannelInfo(thread.channelType as ChannelType).name,
      timeAgo: timeAgoShort(latestMessage.sentAt, now),
      lastMessageAt: latestMessage.sentAt.toISOString(),
      headline: thread.aiTitle?.trim() || copy.headline,
      contextLine: copy.context,
      proposalSummary: copy.proposal,
      actionText: copy.actionText,
      actionDisplay: buildHomeActionDisplay(plan),
      replyText: planReplyText(plan),
      question: verdict.kind === "needs_merchant_input" ? verdict.question : null,
      orderRef: copy.orderRef,
      tag: thread.tag,
      isVip: vipCustomerIds.has(thread.customerId),
      isEscalationOnly: verdict.kind === "escalate" && !planReplyText(plan),
      escalationReason: verdict.kind === "escalate" ? verdict.escalationReason : null,
      validationIssues: plan.validation?.status === "invalid"
        ? plan.validation.issues.map(issue => issue.message)
        : [],
    }]
  })
}

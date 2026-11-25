import { merchantAnswerSlotsInCalls } from "@shopkeeper/agent/reply-placeholders"
import { db, SenderType } from "@shopkeeper/db"
import type { ChannelType, OrgSettings } from "@/types"
import { decideAutonomy } from "@shopkeeper/agent/autonomy"
import {
  buildPlanPreview,
  buildHomeActionDisplay,
  planReplyText,
} from "@shopkeeper/agent/plan-preview"
import type { HomeNeedsAttentionItem } from "@/lib/home/summary-contract"
import { toAttachmentDisplayUrl } from "@/lib/attachments/blob-ref"
import { canonicalInboxThreadWhere } from "@/lib/messaging/inbox-filter"
import { getChannelInfo } from "@/lib/messaging/channels"
import { customerDisplayLabel } from "@/lib/messaging/customer-display"
import { formatRelativeTime } from "@/lib/format/date"
import type { NeedsYouThread } from "@/lib/server/needs-you"

// One card per ticket that needs the merchant, in the order given, so the deck,
// the walkthrough and the briefing count the same tickets as the inbox.
export async function loadNeedsAttention(
  organizationId: string,
  settings: Partial<OrgSettings> | null,
  now: Date,
  needsYou: readonly NeedsYouThread[],
): Promise<HomeNeedsAttentionItem[]> {
  if (needsYou.length === 0) return []

  const ids = needsYou.map(thread => thread.id)
  const threads = await db.thread.findMany({
    where: {
      ...canonicalInboxThreadWhere(organizationId),
      id: { in: ids },
      status: "open",
    },
    include: {
      customer: true,
      // The card quotes the customer. On an escalated thread the newest message
      // is the agent's handoff, so this reads the customer's latest instead.
      messages: {
        where: { senderType: SenderType.customer, deletedAt: null },
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

  return needsYou.flatMap(({ id, decision, plan }) => {
    const thread = byId.get(id)
    if (!thread) return []

    const customerMessage = thread.messages[0] ?? null
    const waitingSince = customerMessage?.sentAt ?? thread.lastMessageAt
    const copy = buildPlanPreview(plan, thread.aiSummary, customerMessage?.contentText ?? null)
    const verdict = plan
      ? decideAutonomy(plan, settings, { filterStatus: thread.filterStatus })
      : null
    const replyText = planReplyText(plan)
    // The card offers what the inbox row offers: Send only when the row does.
    const kind: HomeNeedsAttentionItem["kind"] =
      decision === "send" ? "quick_reply"
        : decision === "answer" ? "needs_merchant_input"
          : verdict?.kind === "invalid" ? "invalid"
            : "needs_review"

    return [{
      threadId: thread.id,
      planId: plan?.planId ?? null,
      kind,
      // Real name, else the email/handle they wrote in from. Null only when the
      // customer record carries neither — "Unknown Customer" is not worth showing.
      customerName: thread.customer?.name || thread.customer?.platformId
        ? customerDisplayLabel(thread.customer)
        : null,
      customerMessage: (customerMessage?.contentText ?? "").trim(),
      channelName: getChannelInfo(thread.channelType as ChannelType).name,
      timeAgo: formatRelativeTime(waitingSince, now),
      lastMessageAt: waitingSince.toISOString(),
      headline: thread.aiTitle?.trim() || copy.headline,
      contextLine: copy.context,
      proposalSummary: copy.proposal,
      actionText: copy.actionText,
      actionDisplay: buildHomeActionDisplay(plan),
      replyText,
      blanks: plan ? merchantAnswerSlotsInCalls(plan.rawToolCalls) : [],
      question: verdict?.kind === "needs_merchant_input" ? verdict.question : null,
      orderRef: copy.orderRef,
      tag: thread.tag,
      isVip: vipCustomerIds.has(thread.customerId),
      // Flagged with nothing to send: the merchant handles it in the ticket.
      isEscalationOnly: !replyText && (!plan || verdict?.kind === "escalate"),
      escalationReason: verdict?.kind === "escalate" ? verdict.escalationReason : null,
      validationIssues: plan?.validation?.status === "invalid"
        ? plan.validation.issues.map(issue => issue.message)
        : [],
      ...(plan?.damagePhotos?.length
        ? { damagePhotos: plan.damagePhotos.map(toAttachmentDisplayUrl) }
        : {}),
    }]
  })
}

import { getSupportStats } from '@shopkeeper/agent/support-stats';
import { canonicalInboxThreadWhere } from '@shopkeeper/agent/inbox-filter';
import {
  formatProposedMerchantPreferencesBriefingLine,
  loadProposedMerchantPreferences,
} from '@shopkeeper/agent/merchant-preferences';
import { SENDER_TYPE } from '@shopkeeper/agent/thread-constants';
import { getCurrentPlanForThread } from '@shopkeeper/agent/plan-cache-shape';
import { db } from '@shopkeeper/db';
import { listVerifiedOrderNamesByThread } from '../../storefront-chat-verified-orders.js';
import { loadAttributionLine } from '../../message-handlers/inbound/conversation-attribution.js';
import { byDeadlineFirst } from '../briefing-fields.js';
import { loadDigestShopifyGarnish } from '../digest-shopify-garnish.js';
import {
  formatHandledSection,
  hasHandoffRequestContext,
  loadHandledRollup,
  loadWaitingOnYouItems,
  resolveHandledWindowStart,
  rowHasNoRequest,
  rowRequestFacts,
  type BriefingItem,
} from '../digest-briefing/index.js';
import { bucketDigestThreads } from './bucket.js';
import { DIGEST_QUESTIONABLE_LIMIT } from './constants.js';
import { formatDigestMessage, formatWeeklySummaryLine } from './format.js';
import type { DigestThreadRow, OrgDigest } from './types.js';
import { getGatewayDashboardUrl } from '../../config/env.js';
import { buildConversationBrief } from '../digest-briefing/conversation.js';
import { narrateBriefingItems } from '../digest-briefing/narrate.js';
import { isRecord } from '../../lib/typing.js';

/**
 * Build the support-inbox digest for one org from its open threads, ready to
 * send and to seed `OperatorContext.pendingDigest` for follow-up commands.
 * Returns null when the org has no open tickets and nothing waiting on the
 * operator. Scheduled sends pass `includeEmptyInbox: false` so a quiet inbox
 * falls through to the first-night welcome or is skipped; on-demand `SUMMARY`
 * keeps the default and still reports what was handled since the last briefing.
 */
export async function buildOrgDigest(
  organizationId: string,
  now: Date,
  settings: Record<string, unknown> = {},
  options: { opener?: string | null; includeEmptyInbox?: boolean } = {},
): Promise<OrgDigest | null> {
  const since = resolveHandledWindowStart(settings, now);
  const [openThreads, weeklyStats, handledRollup, waitingItems, garnishLines, attributionLine, proposedPreferences, organization] = await Promise.all([
    db.thread.findMany({
      where: {
        ...canonicalInboxThreadWhere(organizationId),
        // The digest reports filtered threads as a count ("Filtered: n") rather
        // than hiding them, so drop that one clause of the inbox scope.
        filterStatus: undefined,
        status: 'open',
      },
      select: {
        id: true,
        updatedAt: true,
        tag: true,
        channelType: true,
        filterStatus: true,
        filterDecidedAt: true,
        aiTitle: true,
        escalatedAt: true,
        requestSourceMessageId: true,
        customer: { select: { name: true } },
        cachedPlan: true,
        cachedPlanMessageId: true,
        classifierSignals: true,
        messages: {
          where: { deletedAt: null, senderType: { not: SENDER_TYPE.NOTE } },
          orderBy: [{ sentAt: 'desc' }, { id: 'desc' }],
          take: 1,
          select: { id: true, senderType: true, sentAt: true, contentText: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    }),
    getSupportStats(organizationId, 7).catch(() => null),
    loadHandledRollup(organizationId, since),
    loadWaitingOnYouItems(organizationId, now),
    loadDigestShopifyGarnish(organizationId, settings, now),
    loadAttributionLine(organizationId, since),
    loadProposedMerchantPreferences(organizationId),
    db.organization.findUnique({ where: { id: organizationId }, select: { settings: true } }),
  ]);

  const handledSection = formatHandledSection(handledRollup);
  const preferenceBriefingLine = formatProposedMerchantPreferencesBriefingLine(proposedPreferences);
  const includeEmptyInbox = options.includeEmptyInbox ?? true;

  if (openThreads.length === 0 && waitingItems.length === 0 && !includeEmptyInbox) return null;

  // Verification state and legacy request-source text are both joined in one
  // batch per relation. The source lookup is scoped by organization, customer
  // sender, and owning thread so a stale/corrupt pointer cannot disclose text
  // from another conversation.
  const requestSourceIds = [...new Set(openThreads
    .map((thread) => thread.requestSourceMessageId)
    .filter((id): id is string => id != null))];
  const [verifiedByThread, requestSourceMessages] = await Promise.all([
    listVerifiedOrderNamesByThread(
      organizationId,
      openThreads.map((thread) => thread.id),
    ),
    requestSourceIds.length === 0
      ? Promise.resolve([])
      : db.message.findMany({
        where: {
          organizationId,
          id: { in: requestSourceIds },
          deletedAt: null,
          senderType: SENDER_TYPE.CUSTOMER,
        },
        select: { id: true, threadId: true, contentText: true },
      }),
  ]);
  const requestSourceById = new Map(requestSourceMessages.map((message) => [message.id, message]));
  const threads: DigestThreadRow[] = openThreads.map((thread) => {
    const verifiedOrders = verifiedByThread.get(thread.id);
    const sourceMessage = thread.requestSourceMessageId
      ? requestSourceById.get(thread.requestSourceMessageId)
      : undefined;
    const pendingMessage = sourceMessage?.threadId === thread.id
      ? sourceMessage.contentText
      : !thread.requestSourceMessageId && thread.messages[0]?.senderType === SENDER_TYPE.CUSTOMER
        ? thread.messages[0].contentText : null;
    return {
      ...thread,
      ...(verifiedOrders ? { verifiedOrders } : {}),
      pendingMessage,
    };
  });

  const buckets = bucketDigestThreads(threads, now, since);
  const waitingThreadIds = new Set(waitingItems.map((item) => item.threadId));

  const flaggedCandidates = buckets.questionable.filter((thread) =>
    !waitingThreadIds.has(thread.id) && !rowHasNoRequest(thread));
  // Ordered after the limit, not before: the cut is about how much of the
  // briefing these are worth, and reordering it would change which ten the
  // merchant sees rather than which one they see first.
  const flagged = flaggedCandidates.slice(0, DIGEST_QUESTIONABLE_LIMIT);
  const escalated = buckets.genuine
    .filter((thread) => thread.escalatedAt && !waitingThreadIds.has(thread.id) && !rowHasNoRequest(thread));
  // Keep the display and reply ledger in the same order, with deadlines first
  // within each kind of work. The formatter must never regroup these items.
  const handoffConversation = (thread: DigestThreadRow) => {
    const plan = getCurrentPlanForThread(thread, thread.messages);
    return buildConversationBrief({
      customerName: thread.customer.name,
      channelType: thread.channelType,
      verifiedOrders: thread.verifiedOrders,
      sourceText: thread.pendingMessage,
      facts: rowRequestFacts(thread),
      topic: thread.aiTitle,
      rawToolCalls: plan?.rawToolCalls,
      operatorQuestion: plan?.routingEvidence?.question,
      escalationReason: plan?.routingEvidence?.escalationReason,
      now,
    });
  };
  const needsYou: BriefingItem[] = [
    ...byDeadlineFirst(waitingItems, (item) => item.requestFacts, now).map((item): BriefingItem => ({
      threadId: item.threadId,
      kind: item.conversation.question ? 'decision' : 'approval',
      conversation: item.conversation,
      ...(item.planId ? { planId: item.planId } : {}),
      ...(item.needsThreadReview ? { needsThreadReview: true } : {}),
    })),
    ...byDeadlineFirst(escalated, rowRequestFacts, now)
      .map((thread): BriefingItem => ({
        threadId: thread.id,
        kind: 'decision',
        conversation: handoffConversation(thread),
        ...(!hasHandoffRequestContext(thread, now) ? { needsThreadReview: true } : {}),
      })),
    ...byDeadlineFirst(flagged, rowRequestFacts, now).map((thread): BriefingItem => {
      return {
        threadId: thread.id,
        kind: 'flagged',
        conversation: handoffConversation(thread),
        ...(!hasHandoffRequestContext(thread, now) ? { needsThreadReview: true } : {}),
      };
    }),
  ];

  const dashboardUrl = getGatewayDashboardUrl();
  for (const item of needsYou) {
    if (item.conversation) {
      const url = new URL('/dashboard/tickets', dashboardUrl);
      url.searchParams.set('thread', item.threadId);
      item.conversation.threadUrl = url.toString();
    }
  }
  const spendCap = isRecord(organization?.settings) ? organization.settings.dailyLLMSpendCapUsd : undefined;
  const narratedItems = await narrateBriefingItems(organizationId, needsYou, {
    dailyLLMSpendCapUsd: typeof spendCap === 'number' ? spendCap : undefined,
  });

  const weeklyLine = needsYou.length > 0
    ? null
    : weeklyStats
      ? formatWeeklySummaryLine(weeklyStats, buckets.genuine.length)
      : null;

  return {
    message: formatDigestMessage(
      buckets,
      weeklyLine,
      {
        opener: options.opener ?? null,
        needsYou: narratedItems,
        handledSection,
        preferenceBriefingLine,
        // Sits with the sales pulse: same register, same place in the message.
        // It is DB-derived rather than fetched, so it is appended here instead
        // of inside the Shopify garnish loader.
        garnishLines: attributionLine ? [...garnishLines, attributionLine] : garnishLines,
      },
    ),
    pendingDigest: {
      items: needsYou.map(({ threadId, kind, planId, needsThreadReview }) => ({
        threadId,
        kind,
        ...(planId ? { planId } : {}),
        ...(needsThreadReview ? { needsThreadReview: true } : {}),
      })),
      sentAt: now.toISOString(),
    },
    // What the briefing actually flagged, before the recite limit — a count that
    // included the threads the substance gate hid would describe a message the
    // merchant never got.
    flaggedCount: flaggedCandidates.length,
  };
}

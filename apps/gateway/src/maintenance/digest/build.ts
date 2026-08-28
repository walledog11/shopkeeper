import { getSupportStats } from '@shopkeeper/agent/support-stats';
import { canonicalInboxThreadWhere } from '@shopkeeper/agent/inbox-filter';
import {
  formatProposedMerchantPreferencesBriefingLine,
  loadProposedMerchantPreferences,
} from '@shopkeeper/agent/merchant-preferences';
import { SENDER_TYPE } from '@shopkeeper/agent/thread-constants';
import { db } from '@shopkeeper/db';
import { listVerifiedOrderNamesByThread } from '../../storefront-chat-verified-orders.js';
import { loadAttributionLine } from '../../message-handlers/conversation-attribution.js';
import { byDeadlineFirst } from '../briefing-fields.js';
import { loadDigestShopifyGarnish } from '../digest-shopify-garnish.js';
import {
  formatEscalatedTicketLine,
  formatFlaggedTicketLine,
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
  const [openThreads, weeklyStats, handledRollup, waitingItems, garnishLines, attributionLine, proposedPreferences] = await Promise.all([
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
      : null;
    return {
      ...thread,
      ...(verifiedOrders ? { verifiedOrders } : {}),
      pendingMessage,
    };
  });

  const buckets = bucketDigestThreads(threads, now, since);
  const waitingThreadIds = new Set(waitingItems.map((item) => item.threadId));

  const flaggedCandidates = buckets.questionable.filter((thread) => !rowHasNoRequest(thread));
  // Ordered after the limit, not before: the cut is about how much of the
  // briefing these are worth, and reordering it would change which ten the
  // merchant sees rather than which one they see first.
  const flagged = flaggedCandidates.slice(0, DIGEST_QUESTIONABLE_LIMIT);
  const escalated = buckets.genuine
    .filter((thread) => thread.escalatedAt && !waitingThreadIds.has(thread.id) && !rowHasNoRequest(thread));
  // Soonest deadline first, within each group. Across groups is not a choice
  // this can make: `formatNeedsYouProse` renders by kind, so only the order
  // inside one group ever reaches the merchant. Sorting here rather than at
  // render time keeps `pendingDigest.items` in the order they read, which is
  // what a typed digit resolves against.
  const needsYou: BriefingItem[] = [
    ...byDeadlineFirst(waitingItems, (item) => item.requestFacts, now).map((item): BriefingItem => ({
      threadId: item.threadId,
      kind: 'approval',
      ...(item.planId ? { planId: item.planId } : {}),
      ...(item.needsThreadReview ? { needsThreadReview: true } : {}),
      line: item.line,
    })),
    ...byDeadlineFirst(escalated, rowRequestFacts, now)
      .map((thread): BriefingItem => ({
        threadId: thread.id,
        kind: 'decision',
        ...(!hasHandoffRequestContext(thread, now) ? { needsThreadReview: true } : {}),
        line: formatEscalatedTicketLine(thread),
      })),
    ...byDeadlineFirst(flagged, rowRequestFacts, now).map((thread): BriefingItem => {
      return {
        threadId: thread.id,
        kind: 'flagged',
        ...(!hasHandoffRequestContext(thread, now) ? { needsThreadReview: true } : {}),
        // No per-item "Real customer?": the group lead already says these are
        // the ones the agent is unsure about, and repeating the question on
        // every line is the tell that a template wrote it.
        line: formatFlaggedTicketLine(thread, now),
      };
    }),
  ];

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
        needsYou,
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
      // The flagged subset stays in briefing order so anything still reading
      // `threadIds` sees the same tickets, just not the same ordinals.
      threadIds: flagged.map((thread) => thread.id),
      sentAt: now.toISOString(),
    },
    // What the briefing actually flagged, before the recite limit — a count that
    // included the threads the substance gate hid would describe a message the
    // merchant never got.
    flaggedCount: flaggedCandidates.length,
  };
}

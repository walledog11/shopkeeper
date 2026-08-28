import { getPlanExecution } from '@shopkeeper/agent/execution-ledger';
import { decideAutonomy } from '@shopkeeper/agent/autonomy';
import { getCurrentPlanForThread, readAgentPlanCacheRecordShape } from '@shopkeeper/agent/plan-cache-shape';
import { resolveAgentSettings } from '@shopkeeper/agent/settings';
import { canonicalInboxThreadWhere } from '@shopkeeper/agent/inbox-filter';
import { SENDER_TYPE } from '@shopkeeper/agent/thread-constants';
import { db } from '@shopkeeper/db';
import { Prisma } from '@prisma/client';
import { formatFactsBriefingLine } from '../briefing-fields.js';
import { listVerifiedOrderNamesByThread } from '../../storefront-chat-verified-orders.js';
import { parseStoredPendingPlan } from '../../operator-context.js';
import {
  requestDisplayHasContext,
  unavailableRequestDisplay,
} from '../../message-handlers/request-display.js';
import { WAITING_PLAN_MIN_AGE_MS } from './constants.js';
import { rowHasNoRequest, rowAskLess, rowRequestFacts } from './request-facts.js';
import { formatApprovalItemLine } from './ticket-lines.js';
import type { WaitingItem } from './types.js';

async function isPlanExecutionResolved(
  organizationId: string,
  planId: string | undefined,
): Promise<boolean> {
  if (!planId) return false;
  const execution = await getPlanExecution(organizationId, planId);
  return execution != null && execution.status !== 'pending' && execution.status !== 'claimed';
}

async function loadOperatorWaitingItems(
  organizationId: string,
  settings: ReturnType<typeof resolveAgentSettings>,
  now: Date,
): Promise<WaitingItem[]> {
  const contexts = await db.operatorContext.findMany({
    where: {
      organizationId,
      pendingPlans: { not: Prisma.DbNull },
    },
    select: { pendingPlans: true },
  });

  const items: WaitingItem[] = [];
  for (const context of contexts) {
    const plans = (Array.isArray(context.pendingPlans)
      ? context.pendingPlans
          .map(parseStoredPendingPlan)
          .filter((plan): plan is NonNullable<typeof plan> => plan !== null)
      : []);

    for (const pendingPlan of plans) {
      if (await isPlanExecutionResolved(organizationId, pendingPlan.planId)) continue;

      const thread = await db.thread.findFirst({
        where: { id: pendingPlan.threadId, organizationId },
        select: {
          channelType: true,
          filterStatus: true,
          cachedPlan: true,
          cachedPlanMessageId: true,
          requestSourceMessageId: true,
          customer: { select: { name: true } },
          messages: {
            where: { deletedAt: null, senderType: { not: SENDER_TYPE.NOTE } },
            orderBy: [{ sentAt: 'desc' }, { id: 'desc' }],
            take: 1,
            select: { id: true, senderType: true, sentAt: true },
          },
        },
      });
      if (thread) {
        const currentPlan = getCurrentPlanForThread(thread, thread.messages);
        if (
          currentPlan
          && decideAutonomy(currentPlan, settings, { filterStatus: thread.filterStatus }).kind === 'quick_reply'
        ) {
          continue;
        }
      }
      const dedupeKey = pendingPlan.planId
        ?? `${pendingPlan.threadId}:${pendingPlan.planHash ?? ''}:${pendingPlan.instructionHash ?? ''}`;
      const requestDisplay = pendingPlan.requestDisplay ?? unavailableRequestDisplay();
      const requestFacts = requestDisplay.kind === 'classified' ? requestDisplay.facts : null;
      const alignedSourceMessageId = thread?.requestSourceMessageId
        && pendingPlan.sourceMessageId === thread.requestSourceMessageId
        ? thread.requestSourceMessageId
        : null;
      const sourceMessage = alignedSourceMessageId
        ? await db.message.findFirst({
            where: {
              id: alignedSourceMessageId,
              organizationId,
              threadId: pendingPlan.threadId,
              senderType: SENDER_TYPE.CUSTOMER,
              deletedAt: null,
            },
            select: { contentText: true },
          })
        : null;
      const sourceMessageText = sourceMessage?.contentText ?? null;
      items.push({
        dedupeKey,
        threadId: pendingPlan.threadId,
        ...(pendingPlan.planId ? { planId: pendingPlan.planId } : {}),
        requestFacts,
        needsThreadReview: !requestDisplayHasContext(requestDisplay, now) && !sourceMessageText?.trim(),
        line: formatApprovalItemLine({
          customerName: thread?.customer?.name ?? pendingPlan.customerName ?? null,
          channelType: thread?.channelType ?? null,
          rawToolCalls: pendingPlan.rawToolCalls,
          actionLabel: pendingPlan.actionLabel,
          requestDisplay,
          sourceMessageText,
          now,
        }),
      });
    }
  }
  return items;
}

async function loadStaleThreadWaitingItems(
  organizationId: string,
  now: Date,
  coveredThreadIds: Set<string>,
  settings: ReturnType<typeof resolveAgentSettings>,
): Promise<WaitingItem[]> {
  const cutoff = new Date(now.getTime() - WAITING_PLAN_MIN_AGE_MS);
  const threads = await db.thread.findMany({
    where: {
      ...canonicalInboxThreadWhere(organizationId),
      status: 'open',
      cachedPlan: { not: Prisma.DbNull },
      updatedAt: { lte: cutoff },
    },
    select: {
      id: true,
      cachedPlan: true,
      cachedPlanMessageId: true,
      updatedAt: true,
      aiTitle: true,
      classifierSignals: true,
      channelType: true,
      filterStatus: true,
      requestSourceMessageId: true,
      customer: { select: { name: true } },
      messages: {
        where: { deletedAt: null, senderType: { not: SENDER_TYPE.NOTE } },
        orderBy: [{ sentAt: 'desc' }, { id: 'desc' }],
        take: 1,
        select: { id: true, senderType: true, sentAt: true },
      },
    },
  });

  const verifiedByThread = await listVerifiedOrderNamesByThread(
    organizationId,
    threads.map((thread) => thread.id),
  );

  const items: WaitingItem[] = [];
  for (const thread of threads) {
    if (coveredThreadIds.has(thread.id)) continue;

    const cached = readAgentPlanCacheRecordShape(thread.cachedPlan);
    const plan = getCurrentPlanForThread(thread, thread.messages);
    if (!plan || !cached) continue;

    if (decideAutonomy(plan, settings, { filterStatus: thread.filterStatus }).kind === 'quick_reply') {
      continue;
    }
    if (cached.planId && await isPlanExecutionResolved(organizationId, cached.planId)) {
      continue;
    }

    const dedupeKey = cached.planId ?? `thread:${thread.id}:${cached.instruction}`;
    const requestFacts = rowRequestFacts(thread);
    const requestContext = requestFacts
      ? formatFactsBriefingLine(requestFacts, null, now, rowAskLess(thread))
      : null;
    const alignedSourceMessageId = thread.requestSourceMessageId === thread.cachedPlanMessageId
      ? thread.requestSourceMessageId
      : null;
    const sourceMessage = alignedSourceMessageId
      ? await db.message.findFirst({
          where: {
            id: alignedSourceMessageId,
            organizationId,
            threadId: thread.id,
            senderType: SENDER_TYPE.CUSTOMER,
            deletedAt: null,
          },
          select: { contentText: true },
        })
      : null;
    const sourceMessageText = sourceMessage?.contentText ?? null;
    items.push({
      dedupeKey,
      threadId: thread.id,
      ...(cached.planId ? { planId: cached.planId } : {}),
      requestFacts,
      needsThreadReview: requestContext === null && !sourceMessageText?.trim(),
      line: formatApprovalItemLine({
        customerName: thread.customer?.name ?? null,
        channelType: thread.channelType,
        aiTitle: thread.aiTitle,
        rawToolCalls: plan.rawToolCalls,
        verifiedOrders: verifiedByThread.get(thread.id) ?? [],
        requestFacts,
        noRequest: rowHasNoRequest(thread),
        sourceMessageText,
        now,
      }),
    });
  }
  return items;
}

export async function loadWaitingOnYouItems(
  organizationId: string,
  now: Date,
): Promise<WaitingItem[]> {
  const organization = await db.organization.findUnique({
    where: { id: organizationId },
    select: { settings: true },
  });
  const settings = resolveAgentSettings(organization?.settings);
  const operatorItems = await loadOperatorWaitingItems(organizationId, settings, now);
  const seen = new Set<string>();
  const merged: WaitingItem[] = [];

  for (const item of operatorItems) {
    if (seen.has(item.dedupeKey)) continue;
    seen.add(item.dedupeKey);
    merged.push(item);
  }

  const coveredThreads = new Set(operatorItems.map((item) => item.threadId));
  const staleItems = await loadStaleThreadWaitingItems(organizationId, now, coveredThreads, settings);
  for (const item of staleItems) {
    if (seen.has(item.dedupeKey)) continue;
    seen.add(item.dedupeKey);
    merged.push(item);
  }

  return merged;
}

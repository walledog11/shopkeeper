import { getPlanExecution } from '@shopkeeper/agent/execution-ledger';
import { decideAutonomy } from '@shopkeeper/agent/autonomy';
import { getCurrentPlanForThread, readAgentPlanCacheRecordShape } from '@shopkeeper/agent/plan-cache-shape';
import { resolveAgentSettings } from '@shopkeeper/agent/settings';
import { canonicalInboxThreadWhere } from '@shopkeeper/agent/inbox-filter';
import { SENDER_TYPE } from '@shopkeeper/agent/thread-constants';
import type { RequestFacts } from '@shopkeeper/agent/classifier-signals';
import { db } from '@shopkeeper/db';
import { Prisma } from '@prisma/client';
import { formatFactsBriefingLine } from '../briefing-fields.js';
import { listVerifiedOrderNamesByThread } from '../../storefront-chat-verified-orders.js';
import { parseStoredPendingPlan } from '../../operator-context.js';
import {
  requestDisplayHasContext,
  unavailableRequestDisplay,
} from '../../message-handlers/shared/request-display.js';
import { WAITING_PLAN_MIN_AGE_MS } from './constants.js';
import { rowAskLess, rowRequestFacts } from './request-facts.js';
import type { WaitingItem } from './types.js';
import { buildConversationBrief, type ConversationBrief } from './conversation.js';

async function isPlanExecutionResolved(
  organizationId: string,
  planId: string | undefined,
): Promise<boolean> {
  if (!planId) return false;
  const execution = await getPlanExecution(organizationId, planId);
  return execution != null && execution.status !== 'pending' && execution.status !== 'claimed';
}

async function loadCustomerSourceMessage(
  organizationId: string,
  threadId: string,
  messageId: string | null,
): Promise<string | null> {
  if (!messageId) return null;
  const message = await db.message.findFirst({
    where: {
      id: messageId,
      organizationId,
      threadId,
      senderType: SENDER_TYPE.CUSTOMER,
      deletedAt: null,
    },
    select: { contentText: true },
  });
  return message?.contentText ?? null;
}

function toWaitingItem(params: {
  conversation: ConversationBrief;
  dedupeKey: string;
  threadId: string;
  planId?: string;
  requestFacts: RequestFacts | null;
  hasRequestContext: boolean;
  sourceMessageText: string | null;
}): WaitingItem {
  return {
    conversation: params.conversation,
    dedupeKey: params.dedupeKey,
    threadId: params.threadId,
    ...(params.planId ? { planId: params.planId } : {}),
    requestFacts: params.requestFacts,
    needsThreadReview: !params.hasRequestContext && !params.sourceMessageText?.trim(),
  };
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
        const cached = readAgentPlanCacheRecordShape(thread.cachedPlan);
        // A newer request or replacement draft supersedes this queued item.
        // Never describe the old draft and let an approval resolve to the new one.
        if (pendingPlan.planId && cached?.planId && pendingPlan.planId !== cached.planId) continue;
        if (pendingPlan.sourceMessageId && thread.requestSourceMessageId
          && pendingPlan.sourceMessageId !== thread.requestSourceMessageId) continue;
        const currentPlan = getCurrentPlanForThread(thread, thread.messages);
        if (
          currentPlan
          && decideAutonomy(currentPlan, settings, { filterStatus: thread.filterStatus }).kind === 'quick_reply'
        ) {
          continue;
        }
      }
      const requestDisplay = pendingPlan.requestDisplay ?? unavailableRequestDisplay();
      const requestFacts = requestDisplay.kind === 'classified' ? requestDisplay.facts : null;
      const alignedSourceMessageId = thread?.requestSourceMessageId
        && pendingPlan.sourceMessageId === thread.requestSourceMessageId
        ? thread.requestSourceMessageId
        : null;
      const sourceMessageText = await loadCustomerSourceMessage(
        organizationId,
        pendingPlan.threadId,
        alignedSourceMessageId,
      );
      items.push(toWaitingItem({
        conversation: buildConversationBrief({
          customerName: thread?.customer?.name ?? pendingPlan.customerName ?? null,
          channelType: thread?.channelType,
          sourceText: sourceMessageText,
          facts: requestFacts,
          topic: requestDisplay.kind === 'classified' ? requestDisplay.topic : null,
          systemEvent: requestDisplay.kind === 'system' ? requestDisplay.event : undefined,
          rawToolCalls: pendingPlan.rawToolCalls,
          operatorQuestion: readAgentPlanCacheRecordShape(thread?.cachedPlan)?.plan.routingEvidence?.question,
          now,
        }),
        dedupeKey: pendingPlan.planId
          ?? `${pendingPlan.threadId}:${pendingPlan.planHash ?? ''}:${pendingPlan.instructionHash ?? ''}`,
        threadId: pendingPlan.threadId,
        planId: pendingPlan.planId ?? undefined,
        requestFacts,
        hasRequestContext: requestDisplayHasContext(requestDisplay, now),
        sourceMessageText,
      }));
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

    const requestFacts = rowRequestFacts(thread);
    const requestContext = requestFacts
      ? formatFactsBriefingLine(requestFacts, null, now, rowAskLess(thread))
      : null;
    const alignedSourceMessageId = thread.requestSourceMessageId === thread.cachedPlanMessageId
      ? thread.requestSourceMessageId
      : null;
    const sourceMessageText = await loadCustomerSourceMessage(
      organizationId,
      thread.id,
      alignedSourceMessageId,
    );
    items.push(toWaitingItem({
      conversation: buildConversationBrief({
        customerName: thread.customer?.name ?? null,
        channelType: thread.channelType,
        verifiedOrders: verifiedByThread.get(thread.id),
        sourceText: sourceMessageText,
        facts: requestFacts,
        topic: thread.aiTitle,
        rawToolCalls: plan.rawToolCalls,
        operatorQuestion: plan.routingEvidence?.question,
        now,
      }),
      dedupeKey: cached.planId ?? `thread:${thread.id}:${cached.instruction}`,
      threadId: thread.id,
      ...(cached.planId ? { planId: cached.planId } : {}),
      requestFacts,
      hasRequestContext: requestContext !== null,
      sourceMessageText,
    }));
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

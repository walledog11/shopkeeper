import { db } from '@shopkeeper/db';
import { getLatestConversationMessage } from '@shopkeeper/agent/thread-auth';
import { getPendingCustomerMessageId } from '@shopkeeper/agent/plan-cache-shape';
import type { ReturnWatchTool } from '@shopkeeper/db';
import { formatReturnArrivedNotification } from '@shopkeeper/agent/shopify';
import logger from '../logger.js';
import { generateThreadPlan } from '../message-handlers/generate-thread-plan.js';
import { sendOperatorPlanNotification } from '../message-handlers/planning-notifications.js';
import { listOperatorBindings, notifyOperator } from '../operator-notify.js';

export function returnArrivedIdempotencyKey(
  organizationId: string,
  orderId: string,
  returnId: string,
): string {
  return `return-arrived:${organizationId}:${orderId}:${returnId}`;
}

export interface ReturnArrivalWatch {
  id: string;
  threadId: string | null;
  orderId: string;
  shopifyReturnId: string;
  returnName: string | null;
  tool: ReturnWatchTool;
  customerName: string | null;
}

export function buildReturnArrivalInstruction(watch: Pick<ReturnArrivalWatch, 'orderId' | 'returnName' | 'tool'>): string {
  const returnLabel = watch.returnName?.trim() || `order ${watch.orderId}`;
  if (watch.tool === 'create_exchange') {
    return `The exchange return ${returnLabel} on order ${watch.orderId} has arrived back at the warehouse. Process the exchange (ship the replacement) and confirm with the customer.`;
  }
  return `Return ${returnLabel} on order ${watch.orderId} has arrived back at the warehouse. Issue the refund the customer is owed and confirm with a reply.`;
}

export async function pushReturnArrivalApprovalPlan(
  organizationId: string,
  watch: ReturnArrivalWatch,
): Promise<'plan_pushed' | 'notify_only' | 'skipped'> {
  if (!watch.threadId) {
    await notifyReturnArrivalOnly(organizationId, watch);
    return 'notify_only';
  }

  const thread = await db.thread.findFirst({
    where: { id: watch.threadId, organizationId, status: 'open' },
    select: {
      id: true,
      channelType: true,
      aiSummary: true,
      customer: { select: { name: true } },
    },
  });
  if (!thread) {
    logger.info(
      { organizationId, threadId: watch.threadId, watchId: watch.id },
      '[ReturnLifecycleMonitor] thread missing or not open — notify-only fallback',
    );
    await notifyReturnArrivalOnly(organizationId, watch);
    return 'notify_only';
  }

  const latestConversation = await getLatestConversationMessage(watch.threadId);
  const sourceMessageId = latestConversation
    ? getPendingCustomerMessageId([latestConversation])
    : null;
  if (!sourceMessageId) {
    logger.info(
      { organizationId, threadId: watch.threadId, watchId: watch.id },
      '[ReturnLifecycleMonitor] no customer message to plan against — notify-only fallback',
    );
    await notifyReturnArrivalOnly(organizationId, watch);
    return 'notify_only';
  }

  const instruction = buildReturnArrivalInstruction(watch);
  const generated = await generateThreadPlan(organizationId, watch.threadId, false, {
    instruction,
    sourceMessageId,
  });
  const plan = generated.plan;
  if (!plan?.steps?.length || !generated.identity) {
    logger.warn(
      { organizationId, threadId: watch.threadId, watchId: watch.id },
      '[ReturnLifecycleMonitor] planner produced no actionable return-arrival plan — notify-only fallback',
    );
    await notifyReturnArrivalOnly(organizationId, watch);
    return 'notify_only';
  }

  const bindings = await listOperatorBindings(organizationId);
  if (bindings.length === 0) {
    logger.info(
      { organizationId, threadId: watch.threadId, watchId: watch.id },
      '[ReturnLifecycleMonitor] no bound operators — cached plan only',
    );
    return 'skipped';
  }

  await sendOperatorPlanNotification(
    organizationId,
    watch.threadId,
    thread.customer?.name ?? watch.customerName,
    thread.channelType,
    thread.aiSummary,
    plan,
    instruction,
    { identity: generated.identity },
  );
  return 'plan_pushed';
}

async function notifyReturnArrivalOnly(
  organizationId: string,
  watch: ReturnArrivalWatch,
): Promise<number> {
  const message = formatReturnArrivedNotification({
    customerName: watch.customerName,
    orderId: watch.orderId,
    returnName: watch.returnName,
  });
  const bindings = await listOperatorBindings(organizationId);
  const idempotencyKey = returnArrivedIdempotencyKey(organizationId, watch.orderId, watch.shopifyReturnId);
  let notified = 0;
  for (const member of bindings) {
    const result = await notifyOperator(organizationId, member, message, {}, { idempotencyKey });
    if (result) notified += 1;
  }
  return notified;
}

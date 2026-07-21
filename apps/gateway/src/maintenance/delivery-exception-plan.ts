import { db } from '@shopkeeper/db';
import { getLatestConversationMessage } from '@shopkeeper/agent/thread-auth';
import { getPendingCustomerMessageId } from '@shopkeeper/agent/plan-cache-shape';
import type { ShipmentWatchIssueType } from '@shopkeeper/db';
import { formatDeliveryExceptionNotification } from '@shopkeeper/agent/shopify';
import logger from '../logger.js';
import { generateThreadPlan } from '../message-handlers/generate-thread-plan.js';
import { sendOperatorPlanNotification } from '../message-handlers/planning-notifications.js';
import { listOperatorBindings, notifyOperator } from '../operator-notify.js';

export function deliveryExceptionIdempotencyKey(
  organizationId: string,
  orderId: string,
  trackingNumber: string,
): string {
  return `delivery-exception:${organizationId}:${orderId}:${trackingNumber}`;
}

export interface DeliveryExceptionWatch {
  id: string;
  threadId: string | null;
  orderId: string;
  trackingNumber: string;
  trackingCompany: string | null;
  issueType: ShipmentWatchIssueType;
  issueSummary: string | null;
  customerName: string | null;
}

export function buildDeliveryExceptionInstruction(
  watch: Pick<DeliveryExceptionWatch, 'orderId' | 'trackingNumber' | 'issueType' | 'issueSummary'>,
): string {
  const tracking = watch.trackingNumber || 'the shipment';
  if (watch.issueType === 'stalled') {
    return `Order ${watch.orderId} looks stalled in transit (${tracking} has had no recent movement). Draft a short proactive customer heads-up explaining the delay and what you're doing about it. Do not send until the operator approves.`;
  }
  const detail = watch.issueSummary?.trim();
  const suffix = detail ? ` Carrier status: ${detail}.` : '';
  return `Order ${watch.orderId} has a delivery exception on ${tracking}.${suffix} Draft a short proactive customer heads-up with the latest status and next steps. Do not send until the operator approves.`;
}

export async function findOpenThreadForShopifyCustomer(
  organizationId: string,
  shopifyCustomerId: string | null,
): Promise<string | null> {
  if (!shopifyCustomerId) return null;

  const thread = await db.thread.findFirst({
    where: {
      organizationId,
      status: 'open',
      shopifyCustomerId,
      archivedAt: null,
      deletedAt: null,
    },
    orderBy: { updatedAt: 'desc' },
    select: { id: true },
  });
  return thread?.id ?? null;
}

export async function resolveDeliveryExceptionThread(params: {
  organizationId: string;
  shopifyCustomerId: string | null;
  customerEmail: string | null;
  customerName: string | null;
  orderId: string;
}): Promise<string | null> {
  const existing = await findOpenThreadForShopifyCustomer(
    params.organizationId,
    params.shopifyCustomerId,
  );
  if (existing) return existing;

  if (!params.customerEmail?.trim()) return null;

  const platformId = params.customerEmail.trim().toLowerCase();
  const customer = await db.customer.upsert({
    where: {
      organizationId_platformId: {
        organizationId: params.organizationId,
        platformId,
      },
    },
    update: {
      ...(params.customerName?.trim() ? { name: params.customerName.trim() } : {}),
    },
    create: {
      organizationId: params.organizationId,
      platformId,
      name: params.customerName?.trim() || null,
    },
  });

  const openThread = await db.thread.findFirst({
    where: {
      organizationId: params.organizationId,
      customerId: customer.id,
      channelType: 'email',
      status: 'open',
      archivedAt: null,
      deletedAt: null,
    },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, shopifyCustomerId: true },
  });
  if (openThread) {
    if (params.shopifyCustomerId && !openThread.shopifyCustomerId) {
      await db.thread.update({
        where: { id: openThread.id },
        data: { shopifyCustomerId: params.shopifyCustomerId },
      });
    }
    return openThread.id;
  }

  try {
    const thread = await db.thread.create({
      data: {
        organizationId: params.organizationId,
        customerId: customer.id,
        channelType: 'email',
        status: 'open',
        shopifyCustomerId: params.shopifyCustomerId,
        tag: `Order ${params.orderId}`,
        aiSummary: 'Proactive delivery-exception follow-up',
      },
    });
    return thread.id;
  } catch (error) {
    if ((error as { code?: string }).code !== 'P2002') throw error;
    const thread = await db.thread.findFirst({
      where: {
        organizationId: params.organizationId,
        customerId: customer.id,
        status: 'open',
        channelType: 'email',
      },
      select: { id: true },
    });
    return thread?.id ?? null;
  }
}

export async function pushDeliveryExceptionApprovalPlan(
  organizationId: string,
  watch: DeliveryExceptionWatch,
): Promise<'plan_pushed' | 'notify_only' | 'skipped'> {
  if (!watch.threadId) {
    await notifyDeliveryExceptionOnly(organizationId, watch);
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
      '[DeliveryExceptionMonitor] thread missing or not open — notify-only fallback',
    );
    await notifyDeliveryExceptionOnly(organizationId, watch);
    return 'notify_only';
  }

  const latestConversation = await getLatestConversationMessage(watch.threadId);
  const sourceMessageId = latestConversation
    ? getPendingCustomerMessageId([latestConversation])
    : null;
  if (!sourceMessageId) {
    logger.info(
      { organizationId, threadId: watch.threadId, watchId: watch.id },
      '[DeliveryExceptionMonitor] no customer message to plan against — notify-only fallback',
    );
    await notifyDeliveryExceptionOnly(organizationId, watch);
    return 'notify_only';
  }

  const instruction = buildDeliveryExceptionInstruction(watch);
  const generated = await generateThreadPlan(organizationId, watch.threadId, false, {
    instruction,
    sourceMessageId,
  });
  const plan = generated.plan;
  if (!plan?.steps?.length || !generated.identity) {
    logger.warn(
      { organizationId, threadId: watch.threadId, watchId: watch.id },
      '[DeliveryExceptionMonitor] planner produced no actionable delivery-exception plan — notify-only fallback',
    );
    await notifyDeliveryExceptionOnly(organizationId, watch);
    return 'notify_only';
  }

  const bindings = await listOperatorBindings(organizationId);
  if (bindings.length === 0) {
    logger.info(
      { organizationId, threadId: watch.threadId, watchId: watch.id },
      '[DeliveryExceptionMonitor] no bound operators — cached plan only',
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

async function notifyDeliveryExceptionOnly(
  organizationId: string,
  watch: DeliveryExceptionWatch,
): Promise<number> {
  const message = formatDeliveryExceptionNotification({
    customerName: watch.customerName,
    orderId: watch.orderId,
    trackingNumber: watch.trackingNumber,
    issueKind: watch.issueType,
    statusSummary: watch.issueSummary,
  });
  const bindings = await listOperatorBindings(organizationId);
  const idempotencyKey = deliveryExceptionIdempotencyKey(
    organizationId,
    watch.orderId,
    watch.trackingNumber,
  );
  let notified = 0;
  for (const member of bindings) {
    const result = await notifyOperator(organizationId, member, message, {}, { idempotencyKey });
    if (result) notified += 1;
  }
  return notified;
}

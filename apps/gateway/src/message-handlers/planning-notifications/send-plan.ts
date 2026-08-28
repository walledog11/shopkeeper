import type { DbChannelType } from '@shopkeeper/db';
import { classifyPerson } from '@shopkeeper/agent/person-name';
import { memberOperatorKey } from '@shopkeeper/agent/internal-thread';
import logger from '../../logger.js';
import { getGatewayDashboardUrl } from '../../config/env.js';
import { getOperatorPlanQueueMax } from '../../config/runtime-config.js';
import {
  planNotificationIdempotencyKey,
} from '../../operator-notify-idempotency.js';
import { listOperatorBindings } from '../../operator-notify.js';
import { getContext, type PendingPlan } from '../../operator-context.js';
import { listVerifiedOrderNames } from '../../storefront-chat-verified-orders.js';
import type { AgentPlan } from '../../types.js';
import type { PlanIdentity } from '../planning-types.js';
import {
  buildRequestDisplaySnapshot,
  type RequestDisplay,
  type SystemRequestKind,
} from '../request-display.js';
import { getConversationStage } from './conversation-stage.js';
import { notifyCriticalToAllOperators } from './delivery.js';
import { formatOperatorPlanMessage, parkedActionLabel } from './format-plan.js';
import type { OperatorNotificationExclude, QueueNotice } from './types.js';

export async function sendOperatorPlanNotification(
  organizationId: string,
  threadId: string,
  customerName: string | null,
  channelType: DbChannelType,
  _requestSummary: string | null,
  plan: AgentPlan,
  instruction: string,
  options?: {
    exclude?: OperatorNotificationExclude;
    identity?: PlanIdentity;
    requestDisplay?: RequestDisplay;
    systemRequest?: SystemRequestKind;
  },
): Promise<void> {
  const bindings = await listOperatorBindings(organizationId);

  if (bindings.length === 0) {
    logger.info({ organizationId }, '[Worker] No bound operator members — skipping plan notification');
    return;
  }

  const stage = await getConversationStage(threadId);
  const verifiedOrders = await listVerifiedOrderNames(organizationId, threadId, channelType);
  const requestDisplay = options?.requestDisplay ?? await buildRequestDisplaySnapshot({
    organizationId,
    threadId,
    sourceMessageId: options?.identity?.sourceMessageId,
    rawToolCalls: plan.rawToolCalls,
    ...(options?.systemRequest ? { systemEvent: options.systemRequest } : {}),
  });
  const dashboardUrl = getGatewayDashboardUrl();
  const idempotencyKey = planNotificationIdempotencyKey(
    organizationId,
    threadId,
    plan.rawToolCalls,
    instruction,
  );
  const actionLabel = parkedActionLabel(
    plan.steps,
    classifyPerson({
      customerName,
      channelType,
      verifiedOrders,
      followingText: verifiedOrders.join(', '),
    }),
  );
  const maxDepth = getOperatorPlanQueueMax();
  const parkPlan: PendingPlan = {
    threadId,
    instruction,
    rawToolCalls: plan.rawToolCalls,
    ...(options?.identity ?? {}),
    ...(customerName ? { customerName } : {}),
    ...(actionLabel ? { actionLabel } : {}),
    ...(plan.validation ? { validation: plan.validation } : {}),
    requestDisplay,
  };

  await notifyCriticalToAllOperators(
    organizationId,
    bindings,
    async (member) => {
      // Disclose what parking this card does to the operator's queue. Read here,
      // before notifyOperator appends the new plan, so it sees the prior queue.
      // Best-effort honesty, not a concurrency fix: a read failure must not widen
      // the critical push's failure surface, so drop the line silently.
      let queueNotice: QueueNotice | undefined;
      try {
        const existing = await getContext(organizationId, memberOperatorKey(member.orgMemberId));
        // A thread holds one pending plan, so a same-thread park is a replace, not
        // a stack — only other-thread plans matter for the disclosure.
        const others = existing.pendingPlans.filter((parked) => parked.threadId !== threadId);
        if (others.length > 0) {
          if (maxDepth === 1) {
            queueNotice = { kind: 'replaces', customerName: others[others.length - 1]!.customerName ?? null };
          } else if (others.length + 1 > maxDepth) {
            queueNotice = { kind: 'evicts', customerName: others[0]!.customerName ?? null };
          } else {
            queueNotice = { kind: 'stacked', waiting: others.length + 1 };
          }
        }
      } catch (error) {
        logger.warn(
          { err: (error as Error).message, organizationId, threadId },
          '[Worker] Queue-disclosure context read failed',
        );
      }

      return {
        body: formatOperatorPlanMessage(customerName, channelType, requestDisplay, plan.steps, {
          threadId,
          dashboardUrl,
          rawToolCalls: plan.rawToolCalls,
          stage,
          ...(verifiedOrders.length > 0 ? { verifiedOrders } : {}),
          ...(plan.validation ? { validation: plan.validation } : {}),
          ...(queueNotice ? { queueNotice } : {}),
        }),
        contextPatch: {},
        appendPlan: { plan: parkPlan, maxDepth },
        idempotencyKey,
      };
    },
    threadId,
    'Plan notification',
    options?.exclude,
  );
}

import { db, type DbChannelType } from '@shopkeeper/db';
import { isEscalationOnlyPlan } from '@shopkeeper/agent/autonomy';
import { classifyPerson } from '@shopkeeper/agent/person-name';
import { memberOperatorKey } from '@shopkeeper/agent/internal-thread';
import { SENDER_TYPE } from '@shopkeeper/agent/thread-constants';
import type { AgentPlan } from '@shopkeeper/agent/types';
import { loadWorkspaceImages } from '@shopkeeper/agent/image-attachments';
import logger from '../../../logger.js';
import { getGatewayDashboardUrl } from '../../../config/env.js';
import { getOperatorPlanQueueMax } from '../../../config/runtime-config.js';
import {
  planNotificationIdempotencyKey,
} from '../../../operator-notify-idempotency.js';
import { listOperatorBindings, type OperatorNotifyOptions } from '../../../operator-notify.js';
import { getContext, toPendingPlanToolCalls, type PendingPlan } from '../../../operator-context.js';
import { listVerifiedOrderNames } from '../../../storefront-chat-verified-orders.js';
import type { PlanIdentity } from '../planning-types.js';
import {
  buildRequestDisplaySnapshot,
  requestDisplayHasContext,
  type RequestDisplay,
  type SystemRequestKind,
} from '../../shared/request-display.js';
import { getConversationStage } from './conversation-stage.js';
import { notifyCriticalToAllOperators } from './delivery.js';
import { formatOperatorPlanMessage, parkedActionLabel, requiresDashboardDraftReview } from './format-plan.js';
import type { OperatorNotificationExclude, QueueNotice } from './types.js';

/**
 * The customer's message behind this plan, for the card to quote when the
 * request snapshot cannot render one. The thread filter is the alignment check:
 * `buildRequestDisplaySnapshot` returns `unavailable` both for a stale source
 * message and for a classifier version older than the display format, and only
 * the second of those is safe to quote — a superseded message is not what the
 * merchant is being asked about.
 */
async function loadRequestSourceText(
  organizationId: string,
  threadId: string,
  sourceMessageId: string | null | undefined,
): Promise<string | null> {
  if (!sourceMessageId) return null;
  const message = await db.message.findFirst({
    where: {
      id: sourceMessageId,
      organizationId,
      threadId,
      senderType: SENDER_TYPE.CUSTOMER,
      deletedAt: null,
      thread: { requestSourceMessageId: sourceMessageId },
    },
    select: { contentText: true },
  });
  return message?.contentText ?? null;
}

// A card carries at most this many of the customer's photos. A claim with more
// is reviewed on the dashboard, which shows every one.
const CARD_PHOTO_LIMITS = {
  maxImages: 4,
  maxImageBytes: 5 * 1024 * 1024,
  maxTotalBytes: 20 * 1024 * 1024,
};

/**
 * The customer's photos the plan was made on, sent with the card so the merchant
 * judges the claim on the evidence the dashboard card shows. All of them or none:
 * a card showing some would read as showing the claim.
 */
async function loadCardPhotos(
  organizationId: string,
  plan: AgentPlan,
): Promise<{ count: number; images: NonNullable<OperatorNotifyOptions['images']> } | null> {
  const references = plan.validation?.status === 'invalid' ? [] : plan.damagePhotos ?? [];
  if (references.length === 0) return null;
  const { images, unavailable } = await loadWorkspaceImages(organizationId, references, CARD_PHOTO_LIMITS);
  if (unavailable > 0) {
    logger.warn(
      { organizationId, photos: references.length, unavailable },
      '[Worker] Plan card photos unavailable',
    );
    return { count: references.length, images: [] };
  }
  return {
    count: references.length,
    images: images.map((image) => ({
      data: image.data,
      mediaType: image.mediaType,
      name: image.reference.split('/').at(-1) ?? 'photo',
    })),
  };
}

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
  const escalationOnly = isEscalationOnlyPlan(plan.rawToolCalls);
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
  // Only when the snapshot cannot ground the card itself. A read failure must
  // not widen the critical push's failure surface: without it the card falls
  // back to the unavailable line and drops its approval question, which is the
  // safe direction.
  let sourceMessageText: string | null = null;
  if (!requestDisplayHasContext(requestDisplay)) {
    try {
      sourceMessageText = await loadRequestSourceText(
        organizationId,
        threadId,
        options?.identity?.sourceMessageId,
      );
    } catch (error) {
      logger.warn(
        { err: (error as Error).message, organizationId, threadId },
        '[Worker] Request source-text read failed',
      );
    }
  }
  const photos = await loadCardPhotos(organizationId, plan);
  const photosHidden = photos !== null && photos.images.length === 0;
  const dashboardUrl = getGatewayDashboardUrl();
  const idempotencyKey = (photoState?: 'shown' | 'hidden') => planNotificationIdempotencyKey(
    organizationId,
    threadId,
    plan.rawToolCalls,
    instruction,
    photoState,
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
  const parkPlan = (photosShown: boolean): PendingPlan => ({
    threadId,
    instruction,
    rawToolCalls: toPendingPlanToolCalls(plan.rawToolCalls),
    ...(options?.identity ?? {}),
    ...(customerName ? { customerName } : {}),
    ...(actionLabel ? { actionLabel } : {}),
    ...(plan.validation ? { validation: plan.validation } : {}),
    ...(requiresDashboardDraftReview(plan.communication) || (photos && !photosShown) ? { needsThreadReview: true } : {}),
    requestDisplay,
  });

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
        const existing = escalationOnly ? null : await getContext(organizationId, memberOperatorKey(member.orgMemberId));
        // A thread holds one pending plan, so a same-thread park is a replace, not
        // a stack — only other-thread plans matter for the disclosure.
        const others = (existing?.pendingPlans ?? []).filter((parked) => parked.threadId !== threadId);
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

      const card = (photosShown: boolean) => ({
        body: formatOperatorPlanMessage(customerName, channelType, requestDisplay, plan.steps, {
          threadId,
          dashboardUrl,
          rawToolCalls: plan.rawToolCalls,
          stage,
          ...(verifiedOrders.length > 0 ? { verifiedOrders } : {}),
          ...(plan.validation ? { validation: plan.validation } : {}),
          ...(plan.communication ? { communication: plan.communication } : {}),
          ...(queueNotice ? { queueNotice } : {}),
          ...(sourceMessageText ? { sourceMessageText } : {}),
          ...(photos ? { damagePhotos: { count: photos.count, shown: photosShown } } : {}),
        }),
        idempotencyKey: idempotencyKey(photos ? (photosShown ? 'shown' : 'hidden') : undefined),
        ...(escalationOnly ? {} : { appendPlan: { plan: parkPlan(photosShown), maxDepth } }),
      });

      if (!photos || photosHidden) return { ...card(false), contextPatch: {} };
      return {
        ...card(true),
        contextPatch: {},
        images: photos.images,
        withoutImages: card(false),
      };
    },
    threadId,
    'Plan notification',
    options?.exclude,
  );
}

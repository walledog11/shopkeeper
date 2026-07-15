import type { Queue } from 'bullmq';
import {
  db,
  SenderType,
  Prisma,
  createMessage,
  type DbChannelType,
} from '@shopkeeper/db';
import logger from '../logger.js';
import { JOB, STATUS } from '../constants.js';
import { captureInboundMessageProcessed } from '../product-analytics.js';
import { publishThreadEvent } from '../realtime/publish.js';
import { classifierSignals, type ClassificationResult } from './email-classification.js';
import type { AiSummaryJobData } from '../types.js';

const MAX_INPUT_LENGTH = 4000;
const AI_SUMMARY_DEBOUNCE_MS = 300;

export async function enqueueAiSummaryJob(
  queue: Pick<Queue<AiSummaryJobData>, 'add'>,
  data: AiSummaryJobData,
): Promise<void> {
  await queue.add(JOB.SUMMARIZE_THREAD, data, {
    delay: AI_SUMMARY_DEBOUNCE_MS,
    // BullMQ debounce mode replaces/extends a delayed job for this thread. If
    // a job is already active, the next message becomes one trailing delayed
    // job, bounding bursts to the active run plus the newest trailing run.
    deduplication: {
      id: `thread:${data.threadId}`,
      ttl: AI_SUMMARY_DEBOUNCE_MS,
      extend: true,
      replace: true,
    },
  });
}

// Injection defense lives at the agent, not here: inbound text is wrapped in
// <customer_message> boundaries and the system prompt treats it as untrusted
// data (see apps/dashboard agent prompt). A denylist that drops lines only
// corrupted the stored message, so this just bounds length and preserves the
// customer's words faithfully. NFKC normalization folds compatibility
// codepoints (e.g. "fancy text" Unicode math-bold letters) back to plain
// ASCII so they render at uniform weight everywhere; it's a no-op for text
// that's already canonical.
function sanitizeUserInput(text: string): string {
  if (!text) return text;
  return text.normalize('NFKC').slice(0, MAX_INPUT_LENGTH).trim();
}

export interface ProcessMessageOptions {
  customerName?: string | null;
  profilePicUrl?: string | null;
  initialTag?: string | null;
  subject?: string | null;
  externalMessageId?: string | null;
  integrationId?: string | null;
  receivedAt?: Date | null;
  externalSpaceId?: string | null;
  traceId?: string | null;
  attachments?: string[];
  // Email path classifies pre-persistence so we can write filter columns inline
  // and skip the LLM round-trip in the SUMMARIZE_THREAD job. The job still runs
  // (with skipSummary=true) so plan precompute + operator notify still fire.
  precomputed?: ClassificationResult | null;
  // Kill-switch path: write filterDecidedAt at creation so SUMMARIZE_THREAD
  // still generates summary+tag but skips reclassifying (gated on
  // filterDecidedAt === null). filterStatus stays at the 'genuine' default.
  lockAsGenuine?: boolean;
  // Only true for a real customer-authored provider message. Synthetic
  // provider events such as Shopify order webhooks are not activation input.
  isRealCustomerMessage?: boolean;
}

function normalizeExternalMessageId(externalMessageId: string | null | undefined): string | null {
  const trimmed = externalMessageId?.trim();
  return trimmed ? trimmed : null;
}

export async function processInboundMessage(
  organizationId: string,
  platformId: string,
  channelType: DbChannelType,
  messageText: string,
  aiSummaryQueue: Queue,
  {
    customerName = null,
    profilePicUrl = null,
    initialTag = null,
    subject = null,
    externalMessageId = null,
    integrationId = null,
    receivedAt = null,
    externalSpaceId = null,
    traceId = null,
    attachments = [],
    precomputed = null,
    lockAsGenuine = false,
    isRealCustomerMessage = false,
  }: ProcessMessageOptions = {},
): Promise<{ thread: Awaited<ReturnType<typeof db.thread.create>>; isNew: boolean } | null> {
  messageText = sanitizeUserInput(messageText);

  const providerMessageId = normalizeExternalMessageId(externalMessageId);
  const providerSentAt = receivedAt && Number.isFinite(receivedAt.getTime())
    ? receivedAt
    : null;

  if (providerMessageId) {
    const existing = await db.message.findFirst({
      where: { organizationId, externalMessageId: providerMessageId },
    });
    if (existing) {
      logger.info(
        { organizationId, externalMessageId: providerMessageId },
        '[Worker] Duplicate message detected — skipping',
      );
      return null;
    }
  }

  const customer = await db.customer.upsert({
    where: { organizationId_platformId: { organizationId, platformId } },
    update: {
      ...(customerName && { name: customerName }),
      ...(profilePicUrl && { profilePicUrl }),
    },
    create: {
      organizationId,
      platformId,
      ...(customerName && { name: customerName }),
      ...(profilePicUrl && { profilePicUrl }),
    },
  });

  let thread = await db.thread.findFirst({
    where: { organizationId, customerId: customer.id, status: STATUS.OPEN, channelType },
  });

  let isNew = false;
  if (!thread) {
    try {
      thread = await db.thread.create({
        data: {
          organizationId,
          customerId: customer.id,
          channelType,
          status: STATUS.OPEN,
          ...(subject && { subject }),
          ...(externalSpaceId && { externalSpaceId }),
          ...(initialTag && { tag: initialTag }),
          ...(providerSentAt && { lastMessageAt: providerSentAt }),
          ...(precomputed && {
            aiTitle: precomputed.title,
            aiSummary: precomputed.summary,
            tag: precomputed.tag,
            filterStatus: precomputed.filterStatus,
            filterReason: precomputed.filterReason,
            filterDecidedAt: new Date(),
            classifierSignals: classifierSignals(precomputed),
          }),
          ...(!precomputed && lockAsGenuine && {
            filterReason: 'Spam filter disabled',
            filterDecidedAt: new Date(),
          }),
        },
      });
      isNew = true;
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') {
        thread = await db.thread.findFirst({
          where: { organizationId, customerId: customer.id, status: STATUS.OPEN, channelType },
        });
      } else {
        throw e;
      }
    }
  }

  if (thread && externalSpaceId && !thread.externalSpaceId) {
    thread = await db.thread.update({
      where: { id: thread.id },
      data: { externalSpaceId },
    });
  }

  const routeReceivedAt = integrationId && providerSentAt ? providerSentAt : null;
  let message: Awaited<ReturnType<typeof createMessage>>;
  try {
    message = await db.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: {
          threadId: thread!.id,
          organizationId,
          senderType: SenderType.customer,
          contentText: messageText,
          ...(providerMessageId && { externalMessageId: providerMessageId }),
          ...(integrationId && { integrationId }),
          ...(attachments.length > 0 && { attachments }),
          ...(providerSentAt && { sentAt: providerSentAt }),
        },
      });
      await tx.thread.update({
        where: { id: thread!.id },
        data: {
          cachedPlanMessageId: null,
          cachedPlan: Prisma.DbNull,
        },
      });
      await tx.thread.updateMany({
        where: {
          id: thread!.id,
          organizationId,
          lastMessageAt: { lte: created.sentAt },
        },
        data: {
          lastMessageAt: created.sentAt,
          lastMessageSenderType: created.senderType,
        },
      });
      if (routeReceivedAt) {
        await tx.thread.updateMany({
          where: {
            id: thread!.id,
            organizationId,
            OR: [
              { replyIntegrationUpdatedAt: null },
              { replyIntegrationUpdatedAt: { lt: routeReceivedAt } },
            ],
          },
          data: {
            replyIntegrationId: integrationId,
            replyIntegrationUpdatedAt: routeReceivedAt,
          },
        });
      }
      return created;
    });
  } catch (error) {
    if (providerMessageId && (error as { code?: string }).code === 'P2002') {
      logger.info(
        { organizationId, externalMessageId: providerMessageId },
        '[Worker] Duplicate message detected — skipping',
      );
      return null;
    }
    throw error;
  }

  if (isRealCustomerMessage) {
    void captureInboundMessageProcessed({
      channel: channelType,
      messageId: message.id,
      organizationId,
    });
  }

  await enqueueAiSummaryJob(aiSummaryQueue, {
    threadId: thread!.id,
    organizationId,
    sourceMessageId: message.id,
    customerName: customer.name ?? null,
    channelType,
    traceId: traceId ?? undefined,
    ...(precomputed && { skipSummary: true }),
  });

  // Live inbox: tell connected dashboards a thread changed so they revalidate.
  await publishThreadEvent(organizationId, thread!.id);

  return { thread: thread!, isNew };
}

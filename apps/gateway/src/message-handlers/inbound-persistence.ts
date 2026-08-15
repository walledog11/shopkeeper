import type { Queue } from 'bullmq';
import {
  db,
  SenderType,
  Prisma,
  createMessage,
  type DbChannelType,
} from '@shopkeeper/db';
import logger from '../logger.js';
import { JOB } from '../constants.js';
import { captureInboundMessageProcessed } from '../product-analytics.js';
import { publishThreadEvent } from '../realtime/publish.js';
import { removePendingPlanForThread } from '../operator-context.js';
import { classifierSignals, type ClassificationResult } from './email-classification.js';
import {
  resolveInboundEpisode,
  type ResolveInboundEpisodeResult,
} from './resolve-inbound-episode.js';
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
  // Storefront chat only. Passed so the session's episode history is written in
  // the same transaction that opens the episode — a session bound after the
  // fact would read as unverified for the window in between.
  storefrontSessionId?: string | null;
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
  // A provider event the customer did not write (Shopify order webhooks). It
  // lands as a note so the planner never reads it as a pending request and
  // drafts a reply to a customer who said nothing, and it skips the summary
  // job: notes are excluded from the classifier conversation, so the LLM call
  // would run on empty text.
  synthetic?: boolean;
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
    storefrontSessionId = null,
    precomputed = null,
    lockAsGenuine = false,
    isRealCustomerMessage = false,
    synthetic = false,
  }: ProcessMessageOptions = {},
): Promise<{
  thread: ResolveInboundEpisodeResult['thread'];
  isNew: boolean;
  rolledOverFromThreadId: string | null;
} | null> {
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

  const routeReceivedAt = integrationId && providerSentAt ? providerSentAt : null;

  // One transaction spans the episode decision and the message that caused it.
  // Splitting them is what made the old `findFirst → create → catch P2002`
  // sequence unsafe: a rollover could close the previous episode and then lose
  // the race to open its successor, leaving the customer with no open thread.
  // A duplicate provider message rolls the whole thing back, so a retry can
  // never manufacture a second episode.
  let outcome: {
    thread: ResolveInboundEpisodeResult['thread'];
    isNew: boolean;
    rolledOverFromThreadId: string | null;
    rolloverReason: string | null;
    message: Awaited<ReturnType<typeof createMessage>>;
  };
  try {
    outcome = await db.$transaction(async (tx) => {
      const episode = await resolveInboundEpisode(tx, {
        organizationId,
        customerId: customer.id,
        channelType,
        synthetic,
        providerConversationId: externalSpaceId ?? null,
        storefrontSessionId,
        now: providerSentAt ?? new Date(),
        newThreadData: {
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

      if (externalSpaceId && !episode.thread.externalSpaceId) {
        await tx.thread.update({
          where: { id: episode.thread.id },
          data: { externalSpaceId },
        });
      }

      const created = await tx.message.create({
        data: {
          threadId: episode.thread.id,
          organizationId,
          senderType: synthetic ? SenderType.note : SenderType.customer,
          contentText: messageText,
          ...(providerMessageId && { externalMessageId: providerMessageId }),
          ...(integrationId && { integrationId }),
          ...(attachments.length > 0 && { attachments }),
          ...(providerSentAt && { sentAt: providerSentAt }),
        },
      });
      // A note is not a conversation turn: it neither invalidates a pending
      // plan nor advances the thread's last-message cursor.
      if (!synthetic) {
        await tx.thread.update({
          where: { id: episode.thread.id },
          data: {
            cachedPlanMessageId: null,
            cachedPlan: Prisma.DbNull,
            // The email path classifies pre-persistence and then runs the
            // summary job with skipSummary, so this is the only place its
            // request fields are ever written — without it, email threads would
            // carry a null disposition forever and every gate downstream would
            // have to treat "unknown" as "allowed".
            //
            // The classifier saw this message alone, so on the rare second
            // unanswered email the summary narrows to the newest one rather
            // than covering the whole burst. requestSourceMessageId still points
            // at the newest customer message, which is what compare-and-set
            // reads, so the narrowing costs detail and never correctness.
            ...(precomputed && {
              requestSummary: precomputed.requestSummary || null,
              requestDisposition: precomputed.requestDisposition,
              requestSourceMessageId: created.id,
            }),
          },
        });
        await tx.thread.updateMany({
          where: {
            id: episode.thread.id,
            organizationId,
            lastMessageAt: { lte: created.sentAt },
          },
          data: {
            lastMessageAt: created.sentAt,
            lastMessageSenderType: created.senderType,
          },
        });
      }
      if (routeReceivedAt) {
        await tx.thread.updateMany({
          where: {
            id: episode.thread.id,
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
      return { ...episode, message: created };
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

  const { message, isNew } = outcome;
  const thread = outcome.thread;

  if (outcome.rolledOverFromThreadId) {
    logger.info(
      {
        organizationId,
        channelType,
        expiredThreadId: outcome.rolledOverFromThreadId,
        threadId: thread.id,
        reason: outcome.rolloverReason,
      },
      '[Worker] Conversation episode rolled over',
    );
    // Only the expired thread's parked work. A card the merchant has not
    // answered describes a conversation that has since ended, so approving it
    // later would run a plan built from context the customer has moved past.
    await removePendingPlanForThread(organizationId, outcome.rolledOverFromThreadId);
  }

  if (isRealCustomerMessage) {
    void captureInboundMessageProcessed({
      channel: channelType,
      messageId: message.id,
      organizationId,
    });
  }

  if (!synthetic) {
    await enqueueAiSummaryJob(aiSummaryQueue, {
      threadId: thread.id,
      organizationId,
      sourceMessageId: message.id,
      customerName: customer.name ?? null,
      channelType,
      traceId: traceId ?? undefined,
      ...(precomputed && { skipSummary: true }),
    });
  }

  // Live inbox: tell connected dashboards a thread changed so they revalidate.
  await publishThreadEvent(organizationId, thread.id);
  if (outcome.rolledOverFromThreadId) {
    await publishThreadEvent(organizationId, outcome.rolledOverFromThreadId);
  }

  return { thread, isNew, rolledOverFromThreadId: outcome.rolledOverFromThreadId };
}

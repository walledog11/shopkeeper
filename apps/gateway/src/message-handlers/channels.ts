import type { Job, Queue } from 'bullmq';
import { db } from '@shopkeeper/db';
import { shopifyRestJson } from '@shopkeeper/agent/shopify';
import { fetchInstagramMessagingUserProfile } from '../clients/instagram-graph.js';
import {
  downloadInstagramAttachment,
  isSupportedInstagramBinaryAttachment,
} from '../clients/instagram-media.js';
import { normalizeTikTokShopWebhookPayload } from '../clients/tiktok-shop.js';
import logger from '../logger.js';
import { CHANNEL, STATUS } from '../constants.js';
import { loadActiveInstagramIntegration } from '../lib/instagram-integration.js';
import type {
  InboundJobData,
  InstagramInboundAttachment,
  InstagramInboundJobData,
  ShopifyOrderPayload,
} from '../types.js';
import { uploadInboundAttachment } from '../storage/blob.js';
import { applyInboundAttachmentBudget, mapWithConcurrency } from '../storage/attachment-budget.js';
import { getInboundAttachmentLimits } from '../config/runtime-config.js';
import {
  classifyAndSummarizeNewEmail,
  emptyIntents,
  stripQuotedReply,
  type ClassificationResult,
} from './email-classification.js';
import { processInboundMessage } from './inbound-persistence.js';

async function lookupShopifyCustomerName(organizationId: string, email: string): Promise<string | null> {
  const integration = await db.integration.findFirst({
    where: { organizationId, platform: 'shopify' },
    select: { accessToken: true, externalAccountId: true },
  });
  if (!integration?.accessToken || !integration.externalAccountId) return null;

  try {
    const data = await shopifyRestJson<{ customers?: Array<{ first_name?: string | null; last_name?: string | null }> }>(
      { shop: integration.externalAccountId, accessToken: integration.accessToken },
      'customers/search.json',
      { query: { query: `email:${email}`, limit: 1, fields: 'first_name,last_name' } },
    );
    const c = data.customers?.[0];
    if (!c) return null;
    const name = `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim();
    return name || null;
  } catch (err) {
    logger.warn({ err, email }, '[Worker] Shopify name lookup failed');
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isInstagramInboundAttachment(value: unknown): value is InstagramInboundAttachment {
  return isRecord(value)
    && typeof value.type === 'string'
    && (typeof value.url === 'string' || value.url === null);
}

function isInstagramInboundJobData(data: unknown): data is InstagramInboundJobData {
  return isRecord(data)
    && data.platform === CHANNEL.IG_DM
    && typeof data.integrationId === 'string'
    && typeof data.organizationId === 'string'
    && typeof data.instagramAccountId === 'string'
    && typeof data.senderIgsid === 'string'
    && (typeof data.externalMessageId === 'string' || data.externalMessageId === null)
    && typeof data.providerSentAt === 'string'
    && (typeof data.text === 'string' || data.text === null)
    && Array.isArray(data.attachments)
    && data.attachments.every(isInstagramInboundAttachment)
    && typeof data.traceId === 'string';
}

function publicInstagramShareUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return null;
    if (url.hostname !== 'instagram.com' && !url.hostname.endsWith('.instagram.com')) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function formatInstagramMessage(
  text: string | null,
  attachments: InstagramInboundAttachment[],
): string {
  const parts = text ? [text] : [];
  for (const attachment of attachments) {
    if (attachment.type === 'deleted') {
      parts.push('[Instagram message deleted]');
      continue;
    }
    if (
      attachment.type === 'share'
      || attachment.type === 'story_mention'
      || attachment.type === 'ig_reel'
      || attachment.type === 'reel'
    ) {
      const shareUrl = publicInstagramShareUrl(attachment.url);
      const label = attachment.type === 'story_mention'
        ? 'Instagram story mention'
        : attachment.type === 'share'
          ? 'Shared Instagram content'
          : 'Shared Instagram reel';
      parts.push(shareUrl ? `${label}: ${shareUrl}` : `[${label}]`);
      continue;
    }
    if (attachment.type === 'unsupported') {
      parts.push('[Unsupported Instagram message]');
      continue;
    }
    parts.push(`[Instagram ${attachment.type} attachment]`);
  }
  return parts.join('\n') || '[Unsupported Instagram message]';
}

const MAX_STORED_INSTAGRAM_ATTACHMENTS = 5;

async function persistInstagramBinaryAttachments(
  organizationId: string,
  attachments: InstagramInboundAttachment[],
): Promise<string[]> {
  const refs: string[] = [];
  let attemptedDownloads = 0;
  for (const attachment of attachments) {
    if (!isSupportedInstagramBinaryAttachment(attachment.type)) continue;
    if (attemptedDownloads >= MAX_STORED_INSTAGRAM_ATTACHMENTS) break;
    attemptedDownloads += 1;

    const downloaded = await downloadInstagramAttachment(attachment);
    if (!downloaded) continue;
    const ref = await uploadInboundAttachment(
      organizationId,
      downloaded.filename,
      downloaded.contentType,
      downloaded.base64Content,
    );
    if (ref) refs.push(ref);
  }
  return refs;
}

export async function handleIgDmJob(job: Job<InboundJobData>, aiSummaryQueue: Queue): Promise<void> {
  const candidate: unknown = job.data;
  if (!isInstagramInboundJobData(candidate)) {
    logger.error({ jobId: job.id }, '[Worker] Invalid normalized Instagram job — dropping');
    return;
  }

  const {
    attachments,
    externalMessageId,
    instagramAccountId,
    integrationId,
    organizationId,
    providerSentAt,
    senderIgsid,
    text,
    traceId,
  } = candidate;
  const sentAt = new Date(providerSentAt);
  if (!Number.isFinite(sentAt.getTime())) {
    logger.error({ integrationId, traceId }, '[Worker] Invalid Instagram provider timestamp — dropping');
    return;
  }

  try {
    const integration = await loadActiveInstagramIntegration({
      id: integrationId,
      instagramAccountId,
      organizationId,
    });
    if (!integration) {
      logger.info(
        { instagramAccountId, integrationId, organizationId, traceId },
        '[Worker] Instagram integration disconnected or replaced before processing — dropping',
      );
      return;
    }

    let customerName: string | null = null;
    const profileResult = await fetchInstagramMessagingUserProfile(
      senderIgsid,
      integration.accessToken,
    );
    if (profileResult.ok) {
      customerName = profileResult.data.name ?? profileResult.data.username;
    } else {
      logger.warn(
        {
          category: profileResult.error.category,
          code: profileResult.error.code,
          integrationId,
          requestId: profileResult.error.requestId,
          senderIgsid,
        },
        '[Worker] Instagram profile enrichment failed',
      );
    }

    const storedAttachments = await persistInstagramBinaryAttachments(
      organizationId,
      attachments,
    );

    await processInboundMessage(
      organizationId,
      senderIgsid,
      CHANNEL.IG_DM,
      formatInstagramMessage(text, attachments),
      aiSummaryQueue,
      {
        customerName,
        externalMessageId,
        integrationId,
        attachments: storedAttachments,
        receivedAt: sentAt,
        traceId,
        isRealCustomerMessage: true,
      },
    );
    logger.info({ senderIgsid, organizationId, traceId }, '[Worker] Successfully saved Instagram DM');
  } catch (error) {
    logger.error({ err: error, traceId }, '[Worker] DB operation failed for Instagram DM');
    throw error;
  }
}

export async function handleEmailJob(job: Job<InboundJobData>, aiSummaryQueue: Queue): Promise<void> {
  const { organizationId, traceId } = job.data;
  const { senderName, subject, body } = job.data;
  const senderEmail = job.data.senderEmail?.trim().toLowerCase();

  try {
    if (job.data.integrationId) {
      const activeIntegration = await db.integration.findFirst({
        where: {
          id: job.data.integrationId,
          organizationId,
          platform: CHANNEL.EMAIL,
        },
        select: { id: true },
      });
      if (!activeIntegration) {
        logger.info(
          { integrationId: job.data.integrationId, organizationId, traceId },
          '[Worker] Email integration disconnected before processing — dropping',
        );
        return;
      }
    }

    const [existingCustomer, org] = await Promise.all([
      db.customer.findUnique({
        where: { organizationId_platformId: { organizationId, platformId: senderEmail! } },
        select: { id: true, name: true },
      }),
      db.organization.findUnique({
        where: { id: organizationId },
        select: { settings: true },
      }),
    ]);
    const spamFilterEnabled = ((org?.settings ?? {}) as { spamFilterEnabled?: boolean }).spamFilterEnabled !== false;

    const hasOpenThread = existingCustomer
      ? await db.thread.findFirst({
          where: { organizationId, customerId: existingCustomer.id, status: STATUS.OPEN, channelType: CHANNEL.EMAIL },
          select: { id: true },
        })
      : null;

    // Classify only on new email threads. Replies on open threads inherit the
    // existing filterStatus; the kill switch defers classification to the
    // standard SUMMARIZE_THREAD path (which treats unset filter as genuine).
    let precomputed: ClassificationResult | null = null;
    if (!hasOpenThread && spamFilterEnabled) {
      const priorGenuine = existingCustomer
        ? await db.thread.findFirst({
            where: {
              organizationId,
              customerId: existingCustomer.id,
              channelType: CHANNEL.EMAIL,
              filterStatus: 'genuine',
            },
            select: { id: true },
          })
        : null;
      precomputed = priorGenuine
        ? {
            title: subject?.trim()?.slice(0, 60) || 'New email',
            summary: subject?.slice(0, 200) || 'New email',
            tag: 'General',
            filterStatus: 'genuine',
            filterReason: 'Existing customer with prior genuine thread',
            // Classifier is skipped on this fast path — no intent signals to record.
            intents: emptyIntents(),
            language: '',
          }
        : await classifyAndSummarizeNewEmail(organizationId, subject!, body!);
    }

    const emailLocal = senderEmail!.split('@')[0];
    const existingNameIsEmailLike = !existingCustomer?.name
      || existingCustomer.name === senderEmail
      || existingCustomer.name === emailLocal;

    let resolvedName: string | null = senderName?.trim() || null;
    if (!resolvedName && existingNameIsEmailLike) {
      resolvedName = await lookupShopifyCustomerName(organizationId, senderEmail!);
    }
    if (!resolvedName && !existingCustomer) {
      resolvedName = emailLocal;
    }

    const { accepted: budgetedAttachments } = applyInboundAttachmentBudget(job.data.attachments ?? []);
    const attachmentUrls = (await mapWithConcurrency(
      budgetedAttachments,
      getInboundAttachmentLimits().uploadConcurrency,
      (att) => uploadInboundAttachment(organizationId, att.name, att.contentType, att.contentBase64),
    )).filter((url): url is string => url !== null);

    await processInboundMessage(organizationId, senderEmail!, CHANNEL.EMAIL, stripQuotedReply(body!), aiSummaryQueue, {
      customerName: resolvedName,
      subject: subject?.trim() || null,
      externalMessageId: job.data.inboundMessageId,
      integrationId: job.data.integrationId,
      receivedAt: job.data.receivedAt ? new Date(job.data.receivedAt) : undefined,
      traceId,
      attachments: attachmentUrls,
      precomputed,
      lockAsGenuine: !spamFilterEnabled,
      isRealCustomerMessage: true,
    });
    logger.info({ senderEmail, organizationId, traceId, classification: precomputed?.filterStatus ?? null }, '[Worker] Successfully saved Email');
  } catch (error) {
    logger.error({ err: error, traceId }, '[Worker] DB operation failed for Email');
    throw error;
  }
}

export async function handleShopifyJob(job: Job<InboundJobData>, aiSummaryQueue: Queue): Promise<void> {
  const { organizationId, traceId } = job.data;
  const { topic, rawPayload } = job.data as { topic: string; rawPayload: ShopifyOrderPayload };
  const customer = rawPayload.customer;
  const email = customer?.email;

  if (!email && !customer?.id) {
    logger.warn({ traceId }, '[Worker] Shopify order missing customer identity — dropping');
    return;
  }

  const platformId = email ?? `shopify_${customer!.id}`;
  const orderName = rawPayload.name || (rawPayload.order_number ? `#${rawPayload.order_number}` : 'unknown order');
  const customerName = customer?.first_name
    ? `${customer.first_name}${customer.last_name ? ` ${customer.last_name}` : ''}`.trim()
    : (email?.split('@')[0] ?? null);

  const EVENT_MESSAGES: Record<string, string> = {
    'orders/created': `New order ${orderName} was placed.`,
    'orders/fulfilled': `Order ${orderName} has been fulfilled.`,
    'orders/updated': `Order ${orderName} has been updated.`,
    'orders/cancelled': `Order ${orderName} has been cancelled.`,
  };
  const messageText = EVENT_MESSAGES[topic] ?? `Shopify event '${topic}' for order ${orderName}.`;

  try {
    await processInboundMessage(organizationId, platformId, CHANNEL.SHOPIFY, messageText, aiSummaryQueue, {
      customerName,
      initialTag: 'Order Status',
      externalMessageId: job.data.inboundMessageId,
      traceId,
    });
    logger.info({ platformId, organizationId, topic, traceId }, '[Worker] Successfully saved Shopify order event');
  } catch (error) {
    logger.error({ err: error, traceId }, '[Worker] DB operation failed for Shopify order event');
    throw error;
  }
}

export async function handleTikTokShopJob(job: Job<InboundJobData>, aiSummaryQueue: Queue): Promise<void> {
  const { organizationId, traceId } = job.data;
  const message = normalizeTikTokShopWebhookPayload(job.data.rawPayload);

  if (!message || message.isEcho) return;

  const buyerIdentity = message.buyerId ?? message.conversationId;
  const platformId = `tiktok:${message.accountId}:${buyerIdentity}`;

  try {
    await processInboundMessage(organizationId, platformId, CHANNEL.TIKTOK, message.text, aiSummaryQueue, {
      attachments: message.attachments,
      customerName: message.customerName,
      externalMessageId: job.data.inboundMessageId ?? (
        message.messageId ? `tiktok:${message.accountId}:${message.messageId}` : null
      ),
      externalSpaceId: message.conversationId,
      traceId,
      isRealCustomerMessage: true,
    });
    logger.info(
      {
        accountId: message.accountId,
        conversationId: message.conversationId,
        organizationId,
        traceId,
      },
      '[Worker] Successfully saved TikTok Shop buyer message',
    );
  } catch (error) {
    logger.error({ err: error, traceId }, '[Worker] DB operation failed for TikTok Shop buyer message');
    throw error;
  }
}

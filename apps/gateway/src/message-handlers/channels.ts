import type { Job, Queue } from 'bullmq';
import { db } from '@clerk/db';
import logger from '../logger.js';
import { CHANNEL, STATUS } from '../constants.js';
import type { InboundJobData, ShopifyOrderPayload } from '../types.js';
import { uploadInboundAttachment } from '../storage/blob.js';
import {
  classifyAndSummarizeNewEmail,
  lookupShopifyCustomerName,
  processInboundMessage,
  stripQuotedReply,
  type ClassificationResult,
} from './shared.js';

const FB_GRAPH = 'https://graph.facebook.com/v22.0';

export async function handleIgDmJob(job: Job<InboundJobData>, aiSummaryQueue: Queue): Promise<void> {
  const { organizationId, traceId } = job.data;
  const rawPayload = job.data.rawPayload as {
    entry?: Array<{
      messaging?: Array<{
        sender: { id: string };
        message: {
          text?: string;
          is_echo?: boolean;
          mid?: string;
          attachments?: Array<{ type: string; payload: { url?: string } }>;
        };
      }>;
      changes?: Array<{
        value: {
          sender: { id: string };
          message: {
            text?: string;
            is_echo?: boolean;
            mid?: string;
            attachments?: Array<{ type: string; payload: { url?: string } }>;
          };
        };
      }>;
    }>;
  };

  const entry = rawPayload.entry?.[0];
  const messagingEvent = entry?.messaging?.[0] ?? entry?.changes?.[0]?.value;

  if (!messagingEvent || !messagingEvent.message) return;
  if (messagingEvent.message.is_echo) return;

  const senderId = messagingEvent.sender.id;
  const messageText = messagingEvent.message.text ?? '';
  const attachmentUrls = (messagingEvent.message.attachments ?? [])
    .map((a) => a.payload?.url)
    .filter((u): u is string => typeof u === 'string' && u.length > 0);

  if (!messageText && attachmentUrls.length === 0) return;

  const textToStore = messageText || '[Attachment]';

  try {
    let igName: string | null = null;
    let igProfilePic: string | null = null;
    try {
      const integration = await db.integration.findFirst({
        where: { organizationId, platform: CHANNEL.IG_DM },
        select: { accessToken: true },
      });
      if (integration?.accessToken) {
        const profileRes = await fetch(
          `${FB_GRAPH}/${senderId}?fields=name,profile_pic&access_token=${integration.accessToken}`,
        );
        if (profileRes.ok) {
          const profileData = await profileRes.json() as { name?: string; profile_pic?: string };
          igName = profileData.name || null;
          igProfilePic = profileData.profile_pic || null;
        }
      }
    } catch (profileErr) {
      logger.warn({ err: (profileErr as Error).message, senderId }, '[Worker] Failed to fetch IG profile');
    }

    const result = await processInboundMessage(organizationId, senderId, CHANNEL.IG_DM, textToStore, aiSummaryQueue, {
      customerName: igName,
      profilePicUrl: igProfilePic,
      externalMessageId: messagingEvent.message.mid ?? null,
      attachments: attachmentUrls,
      traceId,
    });
    logger.info({ senderId, organizationId, traceId }, '[Worker] Successfully saved IG DM');
  } catch (error) {
    logger.error({ err: error, traceId }, '[Worker] DB operation failed for IG DM');
    throw error;
  }
}

export async function handleEmailJob(job: Job<InboundJobData>, aiSummaryQueue: Queue): Promise<void> {
  const { organizationId, traceId } = job.data;
  const { senderEmail, senderName, subject, body } = job.data;

  try {
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
            summary: subject?.slice(0, 200) || 'New email',
            tag: 'General',
            filterStatus: 'genuine',
            filterReason: 'Existing customer with prior genuine thread',
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

    const attachmentUrls = (await Promise.all(
      (job.data.attachments ?? []).map((att) =>
        uploadInboundAttachment(organizationId, att.name, att.contentType, att.contentBase64),
      ),
    )).filter((url): url is string => url !== null);

    const result = await processInboundMessage(organizationId, senderEmail!, CHANNEL.EMAIL, stripQuotedReply(body!), aiSummaryQueue, {
      customerName: resolvedName,
      subject: subject?.trim() || null,
      externalMessageId: job.data.inboundMessageId,
      traceId,
      attachments: attachmentUrls,
      precomputed,
      lockAsGenuine: !spamFilterEnabled,
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
    const result = await processInboundMessage(organizationId, platformId, CHANNEL.SHOPIFY, messageText, aiSummaryQueue, {
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

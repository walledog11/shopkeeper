import type { Job, Queue } from 'bullmq';
import { db, SenderType, ChannelType, Prisma } from '@clerk/db';
import Anthropic from '@anthropic-ai/sdk';
import twilio from 'twilio';
import { updateContext } from './sms-context.js';
import logger from './logger.js';
import { CHANNEL, STATUS, MODEL, JOB } from './constants.js';
import type { InboundJobData, ShopifyOrderPayload, AgentPlan, PlanStep } from './types.js';

const FB_GRAPH = 'https://graph.facebook.com/v22.0';
const MAX_INPUT_LENGTH = 4000;

const INJECTION_PATTERNS = [
  /ignore (all |previous |prior )?(instructions?|prompts?|rules?|context)/i,
  /system\s*:/i,
  /assistant\s*:/i,
  /<\/?system>/i,
  /you are now/i,
  /new instructions?:/i,
  /disregard (everything|all)/i,
];

// Lazy init — dotenv runs in worker.ts before any job is processed
let _anthropic: Anthropic | null = null;
const getAnthropic = () => (_anthropic ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }));

type TwilioInstance = ReturnType<typeof twilio>;
let _twilioInitialized = false;
let _twilioClient: TwilioInstance | null = null;
let _twilioFrom: string | null = null;

function getTwilio(): { client: TwilioInstance; from: string } | null {
  if (!_twilioInitialized) {
    _twilioInitialized = true;
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const auth = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_WHATSAPP_NUMBER;
    if (sid && auth && from) {
      _twilioClient = twilio(sid, auth);
      _twilioFrom = from;
    }
  }
  return _twilioClient && _twilioFrom ? { client: _twilioClient, from: _twilioFrom } : null;
}

function sanitizeUserInput(text: string): string {
  if (!text) return text;
  return text
    .slice(0, MAX_INPUT_LENGTH)
    .split('\n')
    .filter(line => !INJECTION_PATTERNS.some(p => p.test(line)))
    .join('\n')
    .trim();
}

function stripQuotedReply(text: string): string {
  if (!text) return text;
  return text
    .replace(/\r\n/g, '\n')
    .replace(/^>?\s*On\s.{5,200}wrote:\s*[\s\S]*/im, '')
    .replace(/^-{3,}\s*Original Message\s*-{3,}[\s\S]*/im, '')
    .replace(/^>.*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function isCustomerSupportMessage(subject: string, body: string): Promise<boolean> {
  try {
    const response = await getAnthropic().messages.create({
      model: MODEL.CLAUDE,
      max_tokens: 10,
      system: `You are a strict email filter for a customer support helpdesk.
          Analyze the email subject and body.
          Return ONLY "true" if it is a real person reaching out for help, asking a question, making a complaint, or needing support.
          Return ONLY "false" if it is spam, a newsletter, a promotional email, an automated system alert, or a delivery status notification.`,
      messages: [{ role: 'user', content: `Subject: ${subject}\n\nBody: ${body}` }],
    });
    const decision = (response.content[0] as { text: string }).text.trim().toLowerCase();
    return decision === 'true';
  } catch (error) {
    logger.error({ err: error }, '[Worker] AI Filter failed — failing open to avoid dropping emails');
    return true;
  }
}

interface ProcessMessageOptions {
  customerName?: string | null;
  profilePicUrl?: string | null;
  initialTag?: string | null;
  externalMessageId?: string | null;
  traceId?: string | null;
  attachments?: string[];
}

async function processInboundMessage(
  organizationId: string,
  platformId: string,
  channelType: ChannelType,
  messageText: string,
  aiSummaryQueue: Queue,
  { customerName = null, profilePicUrl = null, initialTag = null, externalMessageId = null, traceId = null, attachments = [] }: ProcessMessageOptions = {}
) {
  messageText = sanitizeUserInput(messageText);

  if (externalMessageId) {
    const existing = await db.message.findFirst({ where: { externalMessageId } });
    if (existing) {
      logger.info({ externalMessageId }, '[Worker] Duplicate message detected — skipping');
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

  if (!thread) {
    try {
      thread = await db.thread.create({
        data: {
          organizationId,
          customerId: customer.id,
          channelType,
          status: STATUS.OPEN,
          ...(initialTag && { tag: initialTag }),
        },
      });
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

  await db.$transaction([
    db.message.create({
      data: {
        threadId: thread!.id,
        senderType: SenderType.customer,
        contentText: messageText,
        externalMessageId,
        ...(attachments.length > 0 && { attachments }),
      },
    }),
    db.thread.update({
      where: { id: thread!.id },
      data: { cachedPlanMessageId: null, cachedPlan: Prisma.DbNull },
    }),
  ]);

  await aiSummaryQueue.add(JOB.SUMMARIZE_THREAD, {
    threadId: thread!.id,
    organizationId,
    customerName: customer.name ?? null,
    channelType,
    traceId: traceId ?? undefined,
  });

  return thread;
}

export async function generateThreadIntelligence(threadId: string) {
  try {
    logger.info({ threadId }, '[Worker] Generating AI Summary');
    const fullThread = await db.thread.findUnique({
      where: { id: threadId },
      include: { messages: { where: { senderType: { not: SenderType.note } }, orderBy: { sentAt: 'asc' } } },
    });

    if (!fullThread) return null;

    const conversationText = fullThread.messages
      .map(m => `${m.senderType.toUpperCase()}: ${m.contentText}`)
      .join('\n');

    const aiResponse = await getAnthropic().messages.create({
      model: MODEL.CLAUDE,
      max_tokens: 256,
      system: `You are an AI assistant for a customer support team.
          Read the following customer service transcript.
          Provide a 1-sentence summary of the customer's core issue.
          Also choose exactly one tag from this list: Shipping, Returns, Order Status, Product Inquiry, General.
          You must respond ONLY in strict JSON format like this: {"summary": "...", "tag": "..."}`,
      messages: [{ role: 'user', content: conversationText }],
    });

    const block = aiResponse.content[0];
    if (!block || block.type !== 'text') throw new Error('Unexpected AI response type');
    const raw = block.text.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
    const aiData = JSON.parse(raw) as { summary: string; tag: string };

    const updated = await db.thread.update({
      where: { id: threadId },
      data: { aiSummary: aiData.summary, tag: aiData.tag },
    });

    logger.info({ tag: aiData.tag, summary: aiData.summary, threadId }, '[Worker] AI Summary saved');
    return updated;
  } catch (aiError) {
    logger.error({ err: aiError, threadId }, '[Worker] Failed to generate AI summary');
    return null;
  }
}

function formatPlanMessage(customerName: string | null, channelType: ChannelType, summary: string, steps: PlanStep[]): string {
  const channel = channelType === CHANNEL.IG_DM ? 'Instagram DM' : channelType.charAt(0).toUpperCase() + channelType.slice(1);
  const actionableSteps = steps.filter(s => s.category !== 'read');

  const stepLines = actionableSteps.map((s, i) => {
    let text: string;
    if (s.tool === 'send_reply' || s.tool === 'send_email') {
      const firstName = customerName ? customerName.split(' ')[0] : 'the customer';
      text = `Email ${firstName} and let them know.`;
    } else {
      text = s.description || s.label;
    }
    return `${i + 1}. ${text}`;
  });

  const lines: (string | null)[] = [
    `New ticket — ${channel}`,
    customerName ? `From: ${customerName}` : null,
    `"${summary}"`,
    '',
    `Proposed plan (${actionableSteps.length} step${actionableSteps.length !== 1 ? 's' : ''}):`,
    ...stepLines,
    '',
    'Sound good? Reply yes to go ahead or no to skip.',
  ];

  return lines.filter((l): l is string => l !== null).join('\n');
}

export async function sendWhatsAppPlanNotification(
  organizationId: string,
  threadId: string,
  customerName: string | null,
  channelType: ChannelType,
  aiSummary: string | null
): Promise<void> {
  try {
    const dashboardUrl = process.env.DASHBOARD_INTERNAL_URL || 'http://localhost:3000';
    const internalSecret = process.env.INTERNAL_API_SECRET;

    const planRes = await fetch(`${dashboardUrl}/api/agent/plan-internal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': internalSecret || '',
      },
      body: JSON.stringify({ orgId: organizationId, threadId }),
    });

    if (!planRes.ok) {
      logger.warn({ status: planRes.status, threadId }, '[Worker] plan-internal failed — skipping WhatsApp notification');
      return;
    }

    const { plan, instruction } = await planRes.json() as { plan: AgentPlan | null; instruction: string };

    if (!plan || !plan.steps || plan.steps.length === 0) {
      logger.info({ threadId }, '[Worker] No plan steps — skipping notification');
      return;
    }

    const twilioInstance = getTwilio();
    if (!twilioInstance) {
      logger.warn('[Worker] Twilio env vars not set — skipping WhatsApp notification');
      return;
    }

    const members = await db.orgMember.findMany({
      where: { organizationId, phoneVerified: true, phoneNumber: { not: null } },
      select: { phoneNumber: true },
    });

    if (members.length === 0) {
      logger.info({ organizationId }, '[Worker] No verified members — skipping WhatsApp notification');
      return;
    }

    const summary = aiSummary || instruction;
    const message = formatPlanMessage(customerName, channelType, summary, plan.steps);

    for (const member of members) {
      try {
        await twilioInstance.client.messages.create({
          from: twilioInstance.from,
          to: `whatsapp:${member.phoneNumber}`,
          body: message,
        });

        await updateContext(organizationId, member.phoneNumber!, {
          pendingPlan: { threadId, instruction, rawToolCalls: plan.rawToolCalls },
        });

        logger.info({ phoneNumber: member.phoneNumber, threadId }, '[Worker] WhatsApp notification sent');
      } catch (sendErr) {
        logger.error({ err: (sendErr as Error).message, phoneNumber: member.phoneNumber }, '[Worker] Failed to send WhatsApp');
      }
    }
  } catch (err) {
    logger.error({ err: (err as Error).message, threadId }, '[Worker] sendWhatsAppPlanNotification error');
  }
}

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
    .map(a => a.payload?.url)
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
          `${FB_GRAPH}/${senderId}?fields=name,profile_pic&access_token=${integration.accessToken}`
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

    await processInboundMessage(organizationId, senderId, CHANNEL.IG_DM, textToStore, aiSummaryQueue, {
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
    const existingCustomer = await db.customer.findUnique({
      where: { organizationId_platformId: { organizationId, platformId: senderEmail! } },
      select: { id: true },
    });

    const hasOpenThread = existingCustomer
      ? await db.thread.findFirst({
          where: { organizationId, customerId: existingCustomer.id, status: STATUS.OPEN, channelType: CHANNEL.EMAIL },
          select: { id: true },
        })
      : null;

    if (!hasOpenThread) {
      const isCustomer = await isCustomerSupportMessage(subject!, body!);
      if (!isCustomer) {
        logger.info({ senderEmail }, '[Worker] AI dropped non-customer email');
        return;
      }
    }

    await processInboundMessage(organizationId, senderEmail!, CHANNEL.EMAIL, stripQuotedReply(body!), aiSummaryQueue, {
      customerName: senderName || senderEmail!.split('@')[0],
      initialTag: subject!.substring(0, 50),
      externalMessageId: job.data.inboundMessageId,
      traceId,
    });
    logger.info({ senderEmail, organizationId, traceId }, '[Worker] Successfully saved Email');
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
    ? `${customer.first_name}${customer.last_name ? ' ' + customer.last_name : ''}`.trim()
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
      traceId,
    });
    logger.info({ platformId, organizationId, topic, traceId }, '[Worker] Successfully saved Shopify order event');
  } catch (error) {
    logger.error({ err: error, traceId }, '[Worker] DB operation failed for Shopify order event');
    throw error;
  }
}

import type { Job, Queue } from 'bullmq';
import { db, SenderType, Prisma, ThreadFilterStatus, createMessage, type DbChannelType, type DbThreadFilterStatus } from '@clerk/db';
import Anthropic from '@anthropic-ai/sdk';
import twilio from 'twilio';
import * as Sentry from '@sentry/node';
import { updateContext } from './sms-context.js';
import { getGatewayDashboardUrl } from './env.js';
import logger from './logger.js';
import { CHANNEL, STATUS, MODEL, JOB } from './constants.js';
import type { InboundJobData, ShopifyOrderPayload, AgentPlan, PlanStep } from './types.js';

const FB_GRAPH = 'https://graph.facebook.com/v22.0';
const MAX_INPUT_LENGTH = 4000;

async function triggerPlaybooks(
  organizationId: string,
  threadId: string,
  trigger: { type: string; tag?: string }
): Promise<void> {
  try {
    await fetch(`${getGatewayDashboardUrl()}/api/playbooks/trigger`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': getInternalApiSecret(),
      },
      body: JSON.stringify({ organizationId, threadId, trigger }),
    });
  } catch (err) {
    logger.warn({ err: (err as Error).message, threadId, trigger }, '[Worker] triggerPlaybooks call failed');
  }
}

function getInternalApiSecret(): string {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) {
    throw new Error('[Gateway] Missing required environment variable: INTERNAL_API_SECRET');
  }
  return secret;
}

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

export function getTwilio(): { client: TwilioInstance; from: string } | null {
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

async function lookupShopifyCustomerName(organizationId: string, email: string): Promise<string | null> {
  const integration = await db.integration.findFirst({
    where: { organizationId, platform: 'shopify' },
    select: { accessToken: true, externalAccountId: true },
  });
  if (!integration?.accessToken || !integration.externalAccountId) return null;

  try {
    const res = await fetch(
      `https://${integration.externalAccountId}/admin/api/2024-01/customers/search.json?query=email:${encodeURIComponent(email)}&limit=1&fields=first_name,last_name`,
      { headers: { 'X-Shopify-Access-Token': integration.accessToken } }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { customers?: Array<{ first_name?: string | null; last_name?: string | null }> };
    const c = data.customers?.[0];
    if (!c) return null;
    const name = `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim();
    return name || null;
  } catch (err) {
    logger.warn({ err, email }, '[Worker] Shopify name lookup failed');
    return null;
  }
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

interface ClassificationResult {
  summary: string;
  tag: string;
  filterStatus: DbThreadFilterStatus;
  filterReason: string;
}

const CLASSIFIER_SYSTEM_PROMPT = `You are an AI assistant for a customer support team.
Read the customer message and produce four fields in strict JSON:
- "summary": one-sentence third-person summary of what the customer said. Always describe actual content; never refuse, never ask for more info. If the message is one word or fragmentary, quote/paraphrase it (e.g., 'Customer wrote a single word: "Palettegarments".').
- "tag": exactly one of Shipping, Returns, Order Status, Product Inquiry, General.
- "classification": exactly one of "genuine", "questionable", "filtered".
  - "genuine": real human reaching out for support (question, complaint, request).
  - "questionable": ambiguous — may be a real customer or may be unsolicited (cold pitch, vague outreach, possibly automated).
  - "filtered": clearly spam, newsletters, promotions, automated system alerts, or delivery status notifications.
- "reason": one short sentence (under 20 words) justifying the classification.

Respond ONLY in strict JSON: {"summary":"...","tag":"...","classification":"...","reason":"..."}`;

const JSON_FENCE_OPEN = /^```json\s*/i;
const JSON_FENCE_CLOSE = /```\s*$/;
const VALID_FILTER_STATUSES: ReadonlySet<string> = new Set(Object.values(ThreadFilterStatus));
const E2E_FILTERED_SPAM_MARKER = 'E2E_FILTERED_SPAM';

function isFilterStatus(value: string): value is DbThreadFilterStatus {
  return VALID_FILTER_STATUSES.has(value);
}

function parseClassifierJson(raw: string): ClassificationResult {
  const cleaned = raw.replace(JSON_FENCE_OPEN, '').replace(JSON_FENCE_CLOSE, '').trim();
  const parsed = JSON.parse(cleaned) as { summary?: string; tag?: string; classification?: string; reason?: string };
  if (!parsed.summary || !parsed.tag || !parsed.classification || !parsed.reason) {
    throw new Error('Classifier response missing required fields');
  }
  if (!isFilterStatus(parsed.classification)) {
    throw new Error(`Classifier returned invalid classification: ${parsed.classification}`);
  }
  return { summary: parsed.summary, tag: parsed.tag, filterStatus: parsed.classification, filterReason: parsed.reason };
}

function isDeterministicE2EAIEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === 'test' && env.E2E_TEST_RUN === 'true' && env.E2E_AI_MODE === 'deterministic';
}

function deterministicE2EClassification(subject: string, body: string): ClassificationResult | null {
  if (!isDeterministicE2EAIEnabled()) return null;

  const input = `${subject}\n${body}`;
  if (!input.includes(E2E_FILTERED_SPAM_MARKER)) return null;

  return {
    summary: 'E2E spam marker was filtered before automation.',
    tag: 'General',
    filterStatus: 'filtered',
    filterReason: 'Deterministic E2E spam marker',
  };
}

// Fails open to 'genuine' so a classifier outage never drops legitimate mail.
async function classifyAndSummarizeNewEmail(subject: string, body: string): Promise<ClassificationResult> {
  const deterministic = deterministicE2EClassification(subject, body);
  if (deterministic) return deterministic;

  try {
    const response = await getAnthropic().messages.create({
      model: MODEL.CLAUDE,
      max_tokens: 256,
      system: CLASSIFIER_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `Subject: ${subject}\n\nBody: ${body}` }],
    });
    const block = response.content[0];
    if (!block || block.type !== 'text') throw new Error('Unexpected AI response type');
    return parseClassifierJson(block.text);
  } catch (error) {
    logger.error({ err: error }, '[Worker] Classifier failed — failing open as genuine');
    return {
      summary: subject?.slice(0, 200) || 'New email',
      tag: 'General',
      filterStatus: 'genuine',
      filterReason: 'Classifier unavailable',
    };
  }
}

interface ProcessMessageOptions {
  customerName?: string | null;
  profilePicUrl?: string | null;
  initialTag?: string | null;
  subject?: string | null;
  externalMessageId?: string | null;
  traceId?: string | null;
  attachments?: string[];
  // Email path classifies pre-persistence so we can write filter columns inline
  // and skip the LLM round-trip in the SUMMARIZE_THREAD job. The job still runs
  // (with skipSummary=true) so plan precompute + WhatsApp notify still fire.
  precomputed?: ClassificationResult | null;
  // Kill-switch path: write filterDecidedAt at creation so SUMMARIZE_THREAD
  // still generates summary+tag but skips reclassifying (gated on
  // filterDecidedAt === null). filterStatus stays at the 'genuine' default.
  lockAsGenuine?: boolean;
}

async function processInboundMessage(
  organizationId: string,
  platformId: string,
  channelType: DbChannelType,
  messageText: string,
  aiSummaryQueue: Queue,
  { customerName = null, profilePicUrl = null, initialTag = null, subject = null, externalMessageId = null, traceId = null, attachments = [], precomputed = null, lockAsGenuine = false }: ProcessMessageOptions = {}
): Promise<{ thread: Awaited<ReturnType<typeof db.thread.create>>; isNew: boolean } | null> {
  messageText = sanitizeUserInput(messageText);

  const idempotencyKey = externalMessageId
    ?? `${organizationId}:${platformId}:${messageText?.slice(0, 100) ?? ''}:${Math.floor(Date.now() / 60_000)}`;

  const existing = await db.message.findFirst({ where: { externalMessageId: idempotencyKey } });
  if (existing) {
    logger.info({ idempotencyKey }, '[Worker] Duplicate message detected — skipping');
    return null;
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
          ...(initialTag && { tag: initialTag }),
          ...(precomputed && {
            aiSummary: precomputed.summary,
            tag: precomputed.tag,
            filterStatus: precomputed.filterStatus,
            filterReason: precomputed.filterReason,
            filterDecidedAt: new Date(),
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

  await createMessage(
    {
      threadId: thread!.id,
      senderType: SenderType.customer,
      contentText: messageText,
      externalMessageId: idempotencyKey,
      ...(attachments.length > 0 && { attachments }),
    },
    { cachedPlanMessageId: null, cachedPlan: Prisma.DbNull },
  );

  await aiSummaryQueue.add(JOB.SUMMARIZE_THREAD, {
    threadId: thread!.id,
    organizationId,
    customerName: customer.name ?? null,
    channelType,
    traceId: traceId ?? undefined,
    ...(precomputed && { skipSummary: true }),
  });

  return { thread: thread!, isNew };
}

export async function generateThreadIntelligence(
  threadId: string,
  opts?: { triggerPlaybooks?: boolean; skipSummary?: boolean },
) {
  try {
    // skipSummary path: email worker already classified pre-persistence; the
    // thread row is fully populated. Return it as-is so downstream plan
    // precompute + WhatsApp notify can still run.
    if (opts?.skipSummary) {
      return db.thread.findUnique({ where: { id: threadId } });
    }

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
      system: CLASSIFIER_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: conversationText }],
    });

    const block = aiResponse.content[0];
    if (!block || block.type !== 'text') throw new Error('Unexpected AI response type');
    const aiData = parseClassifierJson(block.text);

    // filterDecidedAt is the lock: once any path commits a decision, subsequent
    // summaries refresh aiSummary/tag but don't reclassify.
    // Spam filter scope is email only — IG/Shopify/SMS threads stay genuine
    // regardless of what the classifier says (Shopify order events read like
    // "automated system alerts" and would be wrongly purged otherwise).
    const shouldSetFilter = fullThread.filterDecidedAt === null && fullThread.channelType === CHANNEL.EMAIL;

    const updated = await db.thread.update({
      where: { id: threadId },
      data: {
        aiSummary: aiData.summary,
        tag: aiData.tag,
        ...(shouldSetFilter && {
          filterStatus: aiData.filterStatus,
          filterReason: aiData.filterReason,
          filterDecidedAt: new Date(),
        }),
      },
    });

    logger.info({ tag: aiData.tag, summary: aiData.summary, classification: updated.filterStatus, threadId }, '[Worker] AI Summary saved');

    // Skip on backfills (don't re-run automation on historical tickets) and on
    // filtered threads (no automation on spam).
    if (opts?.triggerPlaybooks !== false && updated.filterStatus !== 'filtered') {
      void triggerPlaybooks(updated.organizationId, threadId, { type: 'tag_applied', tag: aiData.tag });
    }

    return updated;
  } catch (aiError) {
    logger.error({ err: aiError, threadId }, '[Worker] Failed to generate AI summary');
    throw aiError;
  }
}

function formatPlanMessage(customerName: string | null, channelType: DbChannelType, summary: string, steps: PlanStep[]): string {
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

export async function precomputeThreadPlan(
  organizationId: string,
  threadId: string,
  settings: Record<string, unknown>,
): Promise<{ plan: AgentPlan; instruction: string } | null> {
  if (settings.autoPlanOnOpen === false) {
    logger.warn({ threadId, organizationId }, '[Worker] autoPlanOnOpen disabled — no plan will be generated for this thread');
    return null;
  }

  try {
    const thread = await db.thread.findUnique({
      where: { id: threadId },
      select: { status: true },
    });
    if (!thread || thread.status !== STATUS.OPEN) {
      return null;
    }

    const planRes = await fetch(`${getGatewayDashboardUrl()}/api/agent/plan-internal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': getInternalApiSecret(),
      },
      body: JSON.stringify({ orgId: organizationId, threadId }),
    });

    if (!planRes.ok) {
      const responseBody = await planRes.text().catch(() => '');
      logger.warn(
        { status: planRes.status, threadId, organizationId, responseBody: responseBody.slice(0, 500) },
        '[Worker] plan-internal failed during precompute',
      );
      throw new Error(`plan-internal returned ${planRes.status}: ${responseBody.slice(0, 200)}`);
    }

    const { plan, instruction } = await planRes.json() as { plan: AgentPlan | null; instruction: string };
    if (!plan || !plan.steps || plan.steps.length === 0) {
      return null;
    }
    return { plan, instruction };
  } catch (err) {
    logger.error({ err: (err as Error).message, threadId, organizationId }, '[Worker] precomputeThreadPlan error');
    Sentry.captureException(err, {
      tags: { path: 'plan-precompute' },
      extra: { threadId, organizationId },
    });
    throw err;
  }
}

export async function sendWhatsAppPlanNotification(
  organizationId: string,
  threadId: string,
  customerName: string | null,
  channelType: DbChannelType,
  aiSummary: string | null,
  plan: AgentPlan,
  instruction: string,
): Promise<void> {
  try {
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

interface BusinessHoursSettings {
  businessHoursEnabled: boolean;
  businessHoursDays: string[];
  businessHoursStart: number;
  businessHoursEnd: number;
  businessHoursTimezoneOffset: number;
}

const BUSINESS_HOURS_DEFAULTS: BusinessHoursSettings = {
  businessHoursEnabled: false,
  businessHoursDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
  businessHoursStart: 9,
  businessHoursEnd: 17,
  businessHoursTimezoneOffset: 0,
};

export function resolveBusinessHoursSettings(raw: Record<string, unknown>): BusinessHoursSettings {
  return {
    businessHoursEnabled: (raw.businessHoursEnabled as boolean) ?? BUSINESS_HOURS_DEFAULTS.businessHoursEnabled,
    businessHoursDays: (raw.businessHoursDays as string[]) ?? BUSINESS_HOURS_DEFAULTS.businessHoursDays,
    businessHoursStart: (raw.businessHoursStart as number) ?? BUSINESS_HOURS_DEFAULTS.businessHoursStart,
    businessHoursEnd: (raw.businessHoursEnd as number) ?? BUSINESS_HOURS_DEFAULTS.businessHoursEnd,
    businessHoursTimezoneOffset: (raw.businessHoursTimezoneOffset as number) ?? BUSINESS_HOURS_DEFAULTS.businessHoursTimezoneOffset,
  };
}

export function isWithinBusinessHours(settings: BusinessHoursSettings): boolean {
  if (!settings.businessHoursEnabled) return true;
  // Use Intl.DateTimeFormat with an Etc/GMT timezone so day boundaries are correct
  // for negative offsets (Americas). Note: Etc/GMT sign is inverted vs UTC convention.
  const offset = settings.businessHoursTimezoneOffset;
  const tzName = offset === 0
    ? 'UTC'
    : `Etc/GMT${offset > 0 ? '-' : '+'}${Math.abs(offset)}`;

  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tzName,
    hour: 'numeric',
    weekday: 'short',
    hour12: false,
  }).formatToParts(now);

  const localHour = parseInt(parts.find(p => p.type === 'hour')!.value, 10);
  const localDay = parts.find(p => p.type === 'weekday')!.value.toLowerCase().slice(0, 3);

  const withinHours = settings.businessHoursEnd > settings.businessHoursStart
    ? localHour >= settings.businessHoursStart && localHour < settings.businessHoursEnd
    : localHour >= settings.businessHoursStart || localHour < settings.businessHoursEnd;

  return settings.businessHoursDays.includes(localDay) && withinHours;
}

export async function sendAutoAck(organizationId: string, threadId: string): Promise<void> {
  try {
    const res = await fetch(`${getGatewayDashboardUrl()}/api/messages/auto-ack`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': getInternalApiSecret(),
      },
      body: JSON.stringify({ threadId }),
    });

    if (!res.ok) {
      logger.warn({ status: res.status, threadId, organizationId }, '[Worker] Auto-ack dispatch failed');
    } else {
      const body = await res.json() as { ok: boolean; skipped?: boolean };
      if (body.skipped) {
        logger.warn({ threadId, organizationId }, '[Worker] Auto-ack skipped by dashboard — check businessHoursEnabled setting sync');
      } else {
        logger.info({ threadId, organizationId }, '[Worker] Auto-ack sent to customer');
      }
    }
  } catch (err) {
    logger.error({ err: (err as Error).message, threadId }, '[Worker] sendAutoAck error');
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

    const result = await processInboundMessage(organizationId, senderId, CHANNEL.IG_DM, textToStore, aiSummaryQueue, {
      customerName: igName,
      profilePicUrl: igProfilePic,
      externalMessageId: messagingEvent.message.mid ?? null,
      attachments: attachmentUrls,
      traceId,
    });
    if (result?.isNew) {
      void triggerPlaybooks(organizationId, result.thread.id, { type: 'new_ticket' });
    }
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
        : await classifyAndSummarizeNewEmail(subject!, body!);
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

    const result = await processInboundMessage(organizationId, senderEmail!, CHANNEL.EMAIL, stripQuotedReply(body!), aiSummaryQueue, {
      customerName: resolvedName,
      subject: subject?.trim() || null,
      externalMessageId: job.data.inboundMessageId,
      traceId,
      precomputed,
      lockAsGenuine: !spamFilterEnabled,
    });
    if (result?.isNew && precomputed?.filterStatus !== 'filtered') {
      void triggerPlaybooks(organizationId, result.thread.id, { type: 'new_ticket' });
    }
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
    const result = await processInboundMessage(organizationId, platformId, CHANNEL.SHOPIFY, messageText, aiSummaryQueue, {
      customerName,
      initialTag: 'Order Status',
      traceId,
    });
    if (result?.isNew) {
      void triggerPlaybooks(organizationId, result.thread.id, { type: 'new_ticket' });
    }
    logger.info({ platformId, organizationId, topic, traceId }, '[Worker] Successfully saved Shopify order event');
  } catch (error) {
    logger.error({ err: error, traceId }, '[Worker] DB operation failed for Shopify order event');
    throw error;
  }
}

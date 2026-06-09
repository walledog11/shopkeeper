import type { Queue } from 'bullmq';
import {
  db,
  SenderType,
  Prisma,
  ThreadFilterStatus,
  createMessage,
  type DbChannelType,
  type DbThreadFilterStatus,
} from '@shopkeeper/db';
import { anthropic } from '@shopkeeper/agent/ai';
import { shopifyRestJson } from '@shopkeeper/agent/shopify';
import { isSpendCapError } from '@shopkeeper/db';
import logger from '../logger.js';
import { JOB, MODEL, STATUS } from '../constants.js';
import { enforceSpendCap, recordSpend } from '@shopkeeper/agent/spend';
import { readModelUsage } from '@shopkeeper/agent/usage';

const MAX_INPUT_LENGTH = 4000;

export async function lookupShopifyCustomerName(organizationId: string, email: string): Promise<string | null> {
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

// Injection defense lives at the agent, not here: inbound text is wrapped in
// <customer_message> boundaries and the system prompt treats it as untrusted
// data (see apps/dashboard agent prompt). A denylist that drops lines only
// corrupted the stored message, so this just bounds length and preserves the
// customer's words faithfully.
export function sanitizeUserInput(text: string): string {
  if (!text) return text;
  return text.slice(0, MAX_INPUT_LENGTH).trim();
}

export function stripQuotedReply(text: string): string {
  if (!text) return text;
  return text
    .replace(/\r\n/g, '\n')
    .replace(/^>?\s*On\s.{5,200}wrote:\s*[\s\S]*/im, '')
    .replace(/^-{3,}\s*Original Message\s*-{3,}[\s\S]*/im, '')
    .replace(/^>.*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export interface ClassificationResult {
  summary: string;
  tag: string;
  filterStatus: DbThreadFilterStatus;
  filterReason: string;
}

export const CLASSIFIER_SYSTEM_PROMPT = `You are an AI assistant for a customer support team.
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

export function parseClassifierJson(raw: string): ClassificationResult {
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
// orgId is passed so the call counts against the org's daily LLM spend cap;
// if the org has hit its cap, we skip the classifier (still fail open).
export async function classifyAndSummarizeNewEmail(
  organizationId: string,
  subject: string,
  body: string,
): Promise<ClassificationResult> {
  const deterministic = deterministicE2EClassification(subject, body);
  if (deterministic) return deterministic;

  try {
    // Gateway uses default cap (per-org override applies on dashboard agent runs).
    await enforceSpendCap(organizationId, null);

    const response = await anthropic.messages.create({
      model: MODEL.CLAUDE,
      max_tokens: 256,
      system: CLASSIFIER_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `Subject: ${subject}\n\nBody: ${body}` }],
    });
    await recordSpend(organizationId, readModelUsage(response), MODEL.CLAUDE);
    const block = response.content[0];
    if (!block || block.type !== 'text') throw new Error('Unexpected AI response type');
    return parseClassifierJson(block.text);
  } catch (error) {
    if (isSpendCapError(error)) {
      logger.warn({ organizationId }, '[Worker] Classifier skipped — daily LLM spend cap reached');
    } else {
      logger.error({ err: error }, '[Worker] Classifier failed — failing open as genuine');
    }
    return {
      summary: subject?.slice(0, 200) || 'New email',
      tag: 'General',
      filterStatus: 'genuine',
      filterReason: isSpendCapError(error) ? 'Daily AI spend cap reached' : 'Classifier unavailable',
    };
  }
}

export interface ProcessMessageOptions {
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
    traceId = null,
    attachments = [],
    precomputed = null,
    lockAsGenuine = false,
  }: ProcessMessageOptions = {},
): Promise<{ thread: Awaited<ReturnType<typeof db.thread.create>>; isNew: boolean } | null> {
  messageText = sanitizeUserInput(messageText);

  const providerMessageId = normalizeExternalMessageId(externalMessageId);

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

  try {
    await createMessage(
      {
        threadId: thread!.id,
        organizationId,
        senderType: SenderType.customer,
        contentText: messageText,
        ...(providerMessageId && { externalMessageId: providerMessageId }),
        ...(attachments.length > 0 && { attachments }),
      },
      { cachedPlanMessageId: null, cachedPlan: Prisma.DbNull },
    );
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

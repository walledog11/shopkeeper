import type { Queue } from 'bullmq';
import {
  db,
  SenderType,
  Prisma,
  ThreadFilterStatus,
  createMessage,
  type DbChannelType,
  type DbThreadFilterStatus,
} from '@clerk/db';
import Anthropic from '@anthropic-ai/sdk';
import { getGatewayDashboardUrl } from '../config/env.js';
import logger from '../logger.js';
import { JOB, MODEL, STATUS } from '../constants.js';

const MAX_INPUT_LENGTH = 4000;

export async function triggerPlaybooks(
  organizationId: string,
  threadId: string,
  trigger: { type: string; tag?: string },
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

export function getInternalApiSecret(): string {
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
export const getAnthropic = () => (_anthropic ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }));

export async function lookupShopifyCustomerName(organizationId: string, email: string): Promise<string | null> {
  const integration = await db.integration.findFirst({
    where: { organizationId, platform: 'shopify' },
    select: { accessToken: true, externalAccountId: true },
  });
  if (!integration?.accessToken || !integration.externalAccountId) return null;

  try {
    const res = await fetch(
      `https://${integration.externalAccountId}/admin/api/2026-04/customers/search.json?query=email:${encodeURIComponent(email)}&limit=1&fields=first_name,last_name`,
      { headers: { 'X-Shopify-Access-Token': integration.accessToken } },
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

export function sanitizeUserInput(text: string): string {
  if (!text) return text;
  return text
    .slice(0, MAX_INPUT_LENGTH)
    .split('\n')
    .filter((line) => !INJECTION_PATTERNS.some((p) => p.test(line)))
    .join('\n')
    .trim();
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
export async function classifyAndSummarizeNewEmail(subject: string, body: string): Promise<ClassificationResult> {
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

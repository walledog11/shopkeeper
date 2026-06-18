import {
  ThreadFilterStatus,
  type DbThreadFilterStatus,
} from '@shopkeeper/db';
import { isSpendCapError } from '@shopkeeper/db';
import { anthropic } from '@shopkeeper/agent/ai';
import { enforceSpendCap, recordSpend } from '@shopkeeper/agent/spend';
import { readModelUsage } from '@shopkeeper/agent/usage';
import logger from '../logger.js';
import { MODEL } from '../constants.js';

export interface ClassificationResult {
  title: string;
  summary: string;
  tag: string;
  filterStatus: DbThreadFilterStatus;
  filterReason: string;
}

export const CLASSIFIER_SYSTEM_PROMPT = `You are an AI assistant for a customer support team.
Read the customer message and produce five fields in strict JSON:
- "title": a short subject line (3 to 6 words) naming the topic, like an email subject line. Use Title Case, no trailing period, and never begin with "Customer" or "The customer". If the message is vague or unclear, say so plainly (e.g., "Unclear one-word message", "Vague inquiry about an offer"). Examples: "Damaged sweater return", "Where is order #1452", "Question about an exclusive offer".
- "summary": one-sentence third-person summary of what the customer said. Always describe actual content; never refuse, never ask for more info. If the message is one word or fragmentary, quote/paraphrase it (e.g., 'Customer wrote a single word: "Palettegarments".').
- "tag": exactly one of Shipping, Returns, Order Status, Product Inquiry, General.
- "classification": exactly one of "genuine", "questionable", "filtered".
  - "genuine": real human reaching out for support (question, complaint, request).
  - "questionable": ambiguous — may be a real customer or may be unsolicited (cold pitch, vague outreach, possibly automated).
  - "filtered": clearly spam, newsletters, promotions, automated system alerts, or delivery status notifications.
- "reason": one short sentence (under 20 words) justifying the classification.

Respond ONLY in strict JSON: {"title":"...","summary":"...","tag":"...","classification":"...","reason":"..."}`;

const JSON_FENCE_OPEN = /^```json\s*/i;
const JSON_FENCE_CLOSE = /```\s*$/;
const VALID_FILTER_STATUSES: ReadonlySet<string> = new Set(Object.values(ThreadFilterStatus));
const E2E_FILTERED_SPAM_MARKER = 'E2E_FILTERED_SPAM';

function isFilterStatus(value: string): value is DbThreadFilterStatus {
  return VALID_FILTER_STATUSES.has(value);
}

// Safety net only — the classifier is asked for "title" directly. If a response
// omits it, derive a clean subject line from the summary rather than throwing
// away an otherwise-valid summary/tag/classification.
function fallbackTitleFromSummary(summary: string): string {
  const stripped = summary
    .replace(/^\s*(the\s+)?customer\s+(is\s+|was\s+|has\s+|have\s+|had\s+|been\s+)*/i, '')
    .replace(/[.?!]+$/, '')
    .trim();
  const base = stripped || summary.trim();
  if (!base) return 'New message';
  const titled = base[0].toUpperCase() + base.slice(1);
  return titled.length > 70 ? `${titled.slice(0, 69)}…` : titled;
}

export function parseClassifierJson(raw: string): ClassificationResult {
  const cleaned = raw.replace(JSON_FENCE_OPEN, '').replace(JSON_FENCE_CLOSE, '').trim();
  const parsed = JSON.parse(cleaned) as { title?: string; summary?: string; tag?: string; classification?: string; reason?: string };
  if (!parsed.summary || !parsed.tag || !parsed.classification || !parsed.reason) {
    throw new Error('Classifier response missing required fields');
  }
  if (!isFilterStatus(parsed.classification)) {
    throw new Error(`Classifier returned invalid classification: ${parsed.classification}`);
  }
  return {
    title: parsed.title?.trim() || fallbackTitleFromSummary(parsed.summary),
    summary: parsed.summary,
    tag: parsed.tag,
    filterStatus: parsed.classification,
    filterReason: parsed.reason,
  };
}

function isDeterministicE2EAIEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === 'test' && env.E2E_TEST_RUN === 'true' && env.E2E_AI_MODE === 'deterministic';
}

function deterministicE2EClassification(subject: string, body: string): ClassificationResult | null {
  if (!isDeterministicE2EAIEnabled()) return null;

  const input = `${subject}\n${body}`;
  if (!input.includes(E2E_FILTERED_SPAM_MARKER)) return null;

  return {
    title: 'Filtered spam',
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
      title: subject?.trim()?.slice(0, 60) || 'New email',
      summary: subject?.slice(0, 200) || 'New email',
      tag: 'General',
      filterStatus: 'genuine',
      filterReason: isSpendCapError(error) ? 'Daily AI spend cap reached' : 'Classifier unavailable',
    };
  }
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

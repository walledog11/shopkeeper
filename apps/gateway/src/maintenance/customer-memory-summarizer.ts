import type Anthropic from '@anthropic-ai/sdk';
import {
  CUSTOMER_MEMORY_VERSION,
  EMPTY_MEMORY,
  KEY_FACTS_MAX,
  KEY_FACT_MAX_CHARS,
  OUTCOME_MAX_CHARS,
  RECENT_INTERACTIONS_MAX,
  SUMMARY_MAX_CHARS,
  boundMemory,
  isSpendCapError,
  type CustomerMemory,
  type CustomerMemoryInteraction,
  type CustomerMemoryPolicyFlags,
} from '@clerk/db';
import { MODEL } from '../constants.js';
import logger from '../logger.js';
import { enforceSpendCap, recordSpend, type SpendCapSettings } from '@clerk/agent/spend';
import { readModelUsage } from '@clerk/agent/usage';
import { anthropic } from '@clerk/agent/ai';

const MAX_THREAD_MESSAGES = 50;
const MAX_MESSAGE_CHARS = 2_000;
const MAX_OUTPUT_TOKENS = 512;

export const CUSTOMER_MEMORY_SYSTEM_PROMPT = `You update durable per-customer memory for a customer support AI.

Given the customer's prior memory and one newly closed support thread, output an updated memory JSON object.

Rules:
- Preserve facts from prior memory unless the new thread explicitly contradicts them.
- Do not speculate. Only store stable facts, preferences, policy-relevant patterns, and concise interaction outcomes.
- Keep one-off issue details in recentInteractions, not keyFacts, unless they reveal a durable preference or pattern.
- Put the newly closed thread first in recentInteractions, then keep the most recent prior interactions.
- Set policyFlags.complaintPattern to true only if there are at least 3 complaint interactions across recentInteractions.
- Keep policyFlags.vip only when prior memory already marks the customer as VIP or the thread explicitly says they are VIP.
- Do not store payment card data, credentials, secrets, or sensitive access codes.
- Use version ${CUSTOMER_MEMORY_VERSION}.`;

export const CUSTOMER_MEMORY_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: {
      type: 'string',
      maxLength: SUMMARY_MAX_CHARS,
      description: 'Concise durable support summary for this customer.',
    },
    keyFacts: {
      type: 'array',
      maxItems: KEY_FACTS_MAX,
      items: { type: 'string', maxLength: KEY_FACT_MAX_CHARS },
      description: 'Durable customer facts or preferences. No one-off issue details.',
    },
    policyFlags: {
      type: 'object',
      additionalProperties: false,
      properties: {
        vip: { type: 'boolean' },
        complaintPattern: { type: 'boolean' },
        priorRefundsTotal: { type: 'number', minimum: 0 },
        priorRefundsCount: { type: 'number', minimum: 0 },
      },
    },
    recentInteractions: {
      type: 'array',
      maxItems: RECENT_INTERACTIONS_MAX,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          threadId: { type: 'string' },
          channel: { type: 'string' },
          tag: { type: ['string', 'null'] },
          closedAt: { type: 'string', format: 'date-time' },
          outcome: { type: 'string', maxLength: OUTCOME_MAX_CHARS },
        },
        required: ['threadId', 'channel', 'tag', 'closedAt', 'outcome'],
      },
    },
    version: { type: 'number', const: CUSTOMER_MEMORY_VERSION },
  },
  required: ['summary', 'keyFacts', 'policyFlags', 'recentInteractions', 'version'],
} as const;

export interface CustomerMemoryCustomerInput {
  id: string;
  organizationId: string;
  name?: string | null;
  platformId?: string | null;
}

export interface CustomerMemoryClosedThreadInput {
  id: string;
  organizationId: string;
  customerId: string;
  channelType: string;
  tag?: string | null;
  subject?: string | null;
  aiSummary?: string | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
  closedAt?: Date | string | null;
}

export interface CustomerMemoryMessageInput {
  id?: string;
  senderType: string;
  contentText?: string | null;
  mediaUrl?: string | null;
  attachments?: string[] | null;
  sentAt?: Date | string | null;
  deletedAt?: Date | string | null;
}

export interface SummarizeCustomerMemoryParams {
  priorMemory: CustomerMemory;
  customer: CustomerMemoryCustomerInput;
  closedThread: CustomerMemoryClosedThreadInput;
  messages: CustomerMemoryMessageInput[];
  spendSettings?: SpendCapSettings | null;
}

interface SerializedMessage {
  id: string | null;
  senderType: string;
  sentAt: string | null;
  content: string;
}

interface SummarizerPayload {
  priorMemory: CustomerMemory;
  customer: {
    id: string;
    name: string | null;
  };
  closedThread: {
    id: string;
    channel: string;
    tag: string | null;
    subject: string | null;
    aiSummary: string | null;
    closedAt: string;
  };
  messages: SerializedMessage[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function dateMs(value: Date | string | null | undefined): number {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : 0;
  if (typeof value === 'string') {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : 0;
  }
  return 0;
}

function toIso(value: Date | string | null | undefined, fallback: Date): string {
  const ms = dateMs(value);
  return new Date(ms || fallback.getTime()).toISOString();
}

function closedThreadIso(thread: CustomerMemoryClosedThreadInput): string {
  return toIso(thread.closedAt ?? thread.updatedAt ?? thread.createdAt, new Date());
}

function renderMessageContent(message: CustomerMemoryMessageInput): string {
  const text = message.contentText?.trim();
  if (text) return text.slice(0, MAX_MESSAGE_CHARS);

  const attachments = message.attachments?.length ?? 0;
  if (message.mediaUrl && attachments > 0) return `[media plus ${attachments} attachment${attachments === 1 ? '' : 's'}]`;
  if (message.mediaUrl) return '[media]';
  if (attachments > 0) return `[${attachments} attachment${attachments === 1 ? '' : 's'}]`;
  return '[no text]';
}

function serializeMessages(messages: CustomerMemoryMessageInput[]): SerializedMessage[] {
  return messages
    .filter((message) => !message.deletedAt && message.senderType !== 'note')
    .slice()
    .sort((a, b) => dateMs(a.sentAt) - dateMs(b.sentAt))
    .slice(-MAX_THREAD_MESSAGES)
    .map((message) => ({
      id: message.id ?? null,
      senderType: message.senderType,
      sentAt: message.sentAt ? toIso(message.sentAt, new Date(0)) : null,
      content: renderMessageContent(message),
    }));
}

function buildSummarizerPayload(params: SummarizeCustomerMemoryParams): SummarizerPayload {
  return {
    priorMemory: boundMemory(params.priorMemory ?? EMPTY_MEMORY),
    customer: {
      id: params.customer.id,
      name: params.customer.name ?? null,
    },
    closedThread: {
      id: params.closedThread.id,
      channel: params.closedThread.channelType,
      tag: params.closedThread.tag ?? null,
      subject: params.closedThread.subject ?? null,
      aiSummary: params.closedThread.aiSummary ?? null,
      closedAt: closedThreadIso(params.closedThread),
    },
    messages: serializeMessages(params.messages),
  };
}

function parsePolicyFlags(value: unknown): CustomerMemoryPolicyFlags {
  if (!isRecord(value)) throw new Error('Customer memory response has invalid policyFlags');

  const flags: CustomerMemoryPolicyFlags = {};
  if (typeof value.vip === 'boolean') flags.vip = value.vip;
  if (typeof value.complaintPattern === 'boolean') flags.complaintPattern = value.complaintPattern;
  if (typeof value.priorRefundsTotal === 'number') flags.priorRefundsTotal = value.priorRefundsTotal;
  if (typeof value.priorRefundsCount === 'number') flags.priorRefundsCount = value.priorRefundsCount;
  return flags;
}

function parseInteraction(value: unknown): CustomerMemoryInteraction {
  if (!isRecord(value)) throw new Error('Customer memory response has invalid recentInteractions item');
  if (
    typeof value.threadId !== 'string' ||
    typeof value.channel !== 'string' ||
    !(typeof value.tag === 'string' || value.tag === null) ||
    typeof value.closedAt !== 'string' ||
    typeof value.outcome !== 'string'
  ) {
    throw new Error('Customer memory response has malformed recentInteractions item');
  }

  return {
    threadId: value.threadId,
    channel: value.channel,
    tag: value.tag,
    closedAt: value.closedAt,
    outcome: value.outcome,
  };
}

function parseMemoryResponse(value: unknown): CustomerMemory {
  if (!isRecord(value)) throw new Error('Customer memory response was not an object');
  if (typeof value.summary !== 'string') throw new Error('Customer memory response missing summary');
  if (!Array.isArray(value.keyFacts) || !value.keyFacts.every((fact) => typeof fact === 'string')) {
    throw new Error('Customer memory response has invalid keyFacts');
  }
  if (!Array.isArray(value.recentInteractions)) {
    throw new Error('Customer memory response has invalid recentInteractions');
  }
  if (value.version !== CUSTOMER_MEMORY_VERSION) {
    throw new Error(`Customer memory response returned unsupported version: ${String(value.version)}`);
  }

  return {
    summary: value.summary,
    keyFacts: value.keyFacts,
    policyFlags: parsePolicyFlags(value.policyFlags),
    recentInteractions: value.recentInteractions.map(parseInteraction),
    version: CUSTOMER_MEMORY_VERSION,
  };
}

function extractMemoryFromResponse(response: Anthropic.Message): CustomerMemory {
  const text = response.content.find((block): block is Anthropic.TextBlock => block.type === 'text')?.text;
  if (!text) throw new Error('Customer memory summarizer returned no JSON text');
  return parseMemoryResponse(JSON.parse(text));
}

function fallbackOutcome(thread: CustomerMemoryClosedThreadInput): string {
  const raw = thread.aiSummary?.trim() || thread.subject?.trim() || (thread.tag ? `${thread.tag} thread closed` : 'Thread closed');
  return raw.slice(0, OUTCOME_MAX_CHARS);
}

function upsertClosedThreadInteraction(
  memory: CustomerMemory,
  thread: CustomerMemoryClosedThreadInput,
): CustomerMemory {
  const existing = memory.recentInteractions.find((interaction) => interaction.threadId === thread.id);
  const interaction: CustomerMemoryInteraction = {
    threadId: thread.id,
    channel: thread.channelType,
    tag: thread.tag ?? null,
    closedAt: closedThreadIso(thread),
    outcome: (existing?.outcome?.trim() || fallbackOutcome(thread)).slice(0, OUTCOME_MAX_CHARS),
  };

  return {
    ...memory,
    recentInteractions: [
      interaction,
      ...memory.recentInteractions.filter((item) => item.threadId !== thread.id),
    ],
  };
}

export async function summarizeCustomerMemory({
  priorMemory,
  customer,
  closedThread,
  messages,
  spendSettings = null,
}: SummarizeCustomerMemoryParams): Promise<CustomerMemory> {
  if (customer.organizationId !== closedThread.organizationId) {
    throw new Error('Customer memory summarizer received customer/thread org mismatch');
  }
  if (customer.id !== closedThread.customerId) {
    throw new Error('Customer memory summarizer received customer/thread id mismatch');
  }

  try {
    await enforceSpendCap(closedThread.organizationId, spendSettings);
  } catch (error) {
    if (isSpendCapError(error)) {
      logger.warn(
        { organizationId: closedThread.organizationId, customerId: customer.id, threadId: closedThread.id },
        '[Worker] Customer memory summarizer skipped — daily LLM spend cap reached',
      );
      return priorMemory;
    }
    throw error;
  }

  const payload = buildSummarizerPayload({ priorMemory, customer, closedThread, messages, spendSettings });
  const response = await anthropic.messages.create({
    model: MODEL.CUSTOMER_MEMORY,
    max_tokens: MAX_OUTPUT_TOKENS,
    temperature: 0,
    system: [{
      type: 'text',
      text: CUSTOMER_MEMORY_SYSTEM_PROMPT,
      cache_control: { type: 'ephemeral' },
    }],
    output_config: {
      format: {
        type: 'json_schema',
        schema: CUSTOMER_MEMORY_OUTPUT_SCHEMA,
      },
    },
    messages: [{
      role: 'user',
      content: JSON.stringify(payload),
    }],
  });

  await recordSpend(closedThread.organizationId, readModelUsage(response), MODEL.CUSTOMER_MEMORY);

  const nextMemory = extractMemoryFromResponse(response);
  return boundMemory(upsertClosedThreadInteraction(nextMemory, closedThread));
}

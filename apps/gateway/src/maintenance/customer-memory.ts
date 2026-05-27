import type { Queue } from 'bullmq';
import type { Prisma } from '@prisma/client';
import {
  CUSTOMER_MEMORY_VERSION,
  EMPTY_MEMORY,
  boundMemory,
  db,
  isEmptyMemory,
  isSpendCapError,
  type CustomerMemory,
  type CustomerMemoryInteraction,
  type CustomerMemoryPolicyFlags,
} from '@clerk/db';
import * as Sentry from '@sentry/node';
import { JOB } from '../constants.js';
import logger from '../logger.js';
import { enforceSpendCap, type GatewaySpendSettings } from '../llm-spend.js';
import type { CustomerMemoryJobData } from '../types.js';
import { summarizeCustomerMemory } from './customer-memory-summarizer.js';

export const CUSTOMER_MEMORY_STALE_AFTER_DAYS = 30;
export const CUSTOMER_MEMORY_STALE_BATCH_PER_ORG = 50;

const CUSTOMER_MEMORY_CHANNELS = ['ig_dm', 'email', 'sms', 'shopify'] as const;
const CUSTOMER_MEMORY_CHANNEL_SET = new Set<string>(CUSTOMER_MEMORY_CHANNELS);

export interface RefreshStaleCustomerMemoryResult {
  organizationsChecked: number;
  organizationsSkippedForSpendCap: number;
  customersMatched: number;
  customersRefreshed: number;
}

interface RefreshStaleCustomerMemoryOptions {
  now?: Date;
  staleAfterDays?: number;
  recentThreadWindowDays?: number;
  batchPerOrg?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function readPolicyFlags(value: unknown): CustomerMemoryPolicyFlags {
  if (!isRecord(value)) return {};
  const flags: CustomerMemoryPolicyFlags = {};
  if (typeof value.vip === 'boolean') flags.vip = value.vip;
  if (typeof value.complaintPattern === 'boolean') flags.complaintPattern = value.complaintPattern;
  if (typeof value.priorRefundsTotal === 'number') flags.priorRefundsTotal = value.priorRefundsTotal;
  if (typeof value.priorRefundsCount === 'number') flags.priorRefundsCount = value.priorRefundsCount;
  return flags;
}

function readInteraction(value: unknown): CustomerMemoryInteraction | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.threadId !== 'string' ||
    typeof value.channel !== 'string' ||
    !(typeof value.tag === 'string' || value.tag === null) ||
    typeof value.closedAt !== 'string' ||
    typeof value.outcome !== 'string'
  ) {
    return null;
  }
  return {
    threadId: value.threadId,
    channel: value.channel,
    tag: value.tag,
    closedAt: value.closedAt,
    outcome: value.outcome,
  };
}

function readPriorMemory(value: unknown): CustomerMemory {
  if (isEmptyMemory(value) || !isRecord(value)) return EMPTY_MEMORY;

  return boundMemory({
    summary: typeof value.summary === 'string' ? value.summary : '',
    keyFacts: Array.isArray(value.keyFacts)
      ? value.keyFacts.filter((fact): fact is string => typeof fact === 'string')
      : [],
    policyFlags: readPolicyFlags(value.policyFlags),
    recentInteractions: Array.isArray(value.recentInteractions)
      ? value.recentInteractions
          .map(readInteraction)
          .filter((interaction): interaction is CustomerMemoryInteraction => interaction !== null)
      : [],
    version: CUSTOMER_MEMORY_VERSION,
  });
}

function toJsonInput(value: CustomerMemory): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function readSpendSettings(settings: unknown): GatewaySpendSettings | null {
  if (!isRecord(settings)) return null;
  const raw = settings.dailyLLMSpendCapUsd;
  if (raw === null || typeof raw === 'number') {
    return { dailyLLMSpendCapUsd: raw };
  }
  return null;
}

function latestConversationMessageAt(messages: Array<{ senderType: string; sentAt: Date }>): Date | null {
  const latest = messages
    .filter((message) => message.senderType !== 'note')
    .reduce<Date | null>((acc, message) => {
      if (!acc || message.sentAt.getTime() > acc.getTime()) return message.sentAt;
      return acc;
    }, null);
  return latest;
}

function parseDate(value: string | Date | null | undefined): Date | null {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  if (typeof value !== 'string') return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms) : null;
}

function jobIdDatePart(closedAt: string | undefined): string | null {
  const parsed = parseDate(closedAt);
  return parsed ? String(parsed.getTime()) : null;
}

function customerMemoryJobId(data: CustomerMemoryJobData): string {
  const closePart = jobIdDatePart(data.closedAt);
  return closePart ? `customer-memory:${data.threadId}:${closePart}` : `customer-memory:${data.threadId}`;
}

function daysAgo(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

export async function enqueueCustomerMemoryThreadClose(
  queue: Queue<CustomerMemoryJobData>,
  data: CustomerMemoryJobData,
) {
  return queue.add(JOB.UPDATE_CUSTOMER_MEMORY, data, {
    jobId: customerMemoryJobId(data),
  });
}

export async function refreshStaleCustomerMemory(
  options: RefreshStaleCustomerMemoryOptions = {},
): Promise<RefreshStaleCustomerMemoryResult> {
  const now = options.now ?? new Date();
  const staleCutoff = daysAgo(now, options.staleAfterDays ?? CUSTOMER_MEMORY_STALE_AFTER_DAYS);
  const recentClosedCutoff = daysAgo(now, options.recentThreadWindowDays ?? CUSTOMER_MEMORY_STALE_AFTER_DAYS);
  const batchPerOrg = options.batchPerOrg ?? CUSTOMER_MEMORY_STALE_BATCH_PER_ORG;
  const result: RefreshStaleCustomerMemoryResult = {
    organizationsChecked: 0,
    organizationsSkippedForSpendCap: 0,
    customersMatched: 0,
    customersRefreshed: 0,
  };

  const staleCustomerWhere = {
    deletedAt: null,
    OR: [
      { memoryUpdatedAt: null },
      { memoryUpdatedAt: { lt: staleCutoff } },
    ],
    threads: {
      some: {
        status: 'closed' as const,
        deletedAt: null,
        updatedAt: { gte: recentClosedCutoff },
        channelType: { in: [...CUSTOMER_MEMORY_CHANNELS] },
      },
    },
  };

  const organizations = await db.organization.findMany({
    where: { customers: { some: staleCustomerWhere } },
    select: { id: true, settings: true },
    orderBy: { createdAt: 'asc' },
  });

  for (const org of organizations) {
    result.organizationsChecked += 1;
    const spendSettings = readSpendSettings(org.settings);
    try {
      await enforceSpendCap(org.id, spendSettings);
    } catch (err) {
      if (isSpendCapError(err)) {
        result.organizationsSkippedForSpendCap += 1;
        logger.warn({ organizationId: org.id }, '[CustomerMemory] Stale refresh skipped — daily LLM spend cap reached');
        continue;
      }
      throw err;
    }

    const recentClosedThreadWhere = {
      status: 'closed' as const,
      deletedAt: null,
      updatedAt: { gte: recentClosedCutoff },
      channelType: { in: [...CUSTOMER_MEMORY_CHANNELS] },
    };

    const customers = await db.customer.findMany({
      where: {
        organizationId: org.id,
        ...staleCustomerWhere,
      },
      select: {
        id: true,
        threads: {
          where: recentClosedThreadWhere,
          orderBy: { updatedAt: 'desc' },
          take: 1,
          select: { id: true, updatedAt: true },
        },
      },
      orderBy: [
        { memoryUpdatedAt: 'asc' },
        { id: 'asc' },
      ],
      take: batchPerOrg,
    });

    result.customersMatched += customers.length;

    for (const customer of customers) {
      const latestClosedThread = customer.threads[0];
      if (!latestClosedThread) continue;

      await updateCustomerMemoryOnThreadClose(latestClosedThread.id, {
        organizationId: org.id,
        closedAt: latestClosedThread.updatedAt.toISOString(),
      });
      result.customersRefreshed += 1;
    }
  }

  return result;
}

export async function updateCustomerMemoryOnThreadClose(
  threadId: string,
  options: { closedAt?: string | null; organizationId?: string | null } = {},
): Promise<void> {
  try {
    const thread = await db.thread.findUnique({
      where: { id: threadId },
      select: {
        id: true,
        organizationId: true,
        customerId: true,
        channelType: true,
        status: true,
        tag: true,
        subject: true,
        aiSummary: true,
        createdAt: true,
        updatedAt: true,
        organization: { select: { settings: true } },
        customer: {
          select: {
            id: true,
            organizationId: true,
            name: true,
            platformId: true,
            memory: true,
            memoryUpdatedAt: true,
          },
        },
        messages: {
          where: { deletedAt: null },
          orderBy: { sentAt: 'asc' },
          select: {
            id: true,
            senderType: true,
            contentText: true,
            mediaUrl: true,
            attachments: true,
            sentAt: true,
            deletedAt: true,
          },
        },
      },
    });

    if (!thread) {
      logger.warn({ threadId }, '[CustomerMemory] Thread not found; skipping memory update');
      return;
    }
    if (options.organizationId && thread.organizationId !== options.organizationId) {
      logger.warn(
        { threadId, organizationId: options.organizationId, threadOrganizationId: thread.organizationId },
        '[CustomerMemory] Thread does not belong to requested organization; skipping memory update',
      );
      return;
    }
    if (thread.status !== 'closed') {
      logger.info({ threadId, status: thread.status }, '[CustomerMemory] Thread is not closed; skipping memory update');
      return;
    }
    if (!CUSTOMER_MEMORY_CHANNEL_SET.has(thread.channelType)) {
      logger.info({ threadId, channelType: thread.channelType }, '[CustomerMemory] Channel does not use customer memory; skipping');
      return;
    }

    const closedAt = parseDate(options.closedAt) ?? thread.updatedAt;
    const priorMemory = readPriorMemory(thread.customer.memory);
    const memoryUpdatedAt = thread.customer.memoryUpdatedAt;
    if (memoryUpdatedAt && memoryUpdatedAt.getTime() > closedAt.getTime()) {
      logger.info({ threadId, customerId: thread.customerId }, '[CustomerMemory] Memory already covers this close event');
      return;
    }

    const latestMessageAt = latestConversationMessageAt(thread.messages);
    const hasThreadInteraction = priorMemory.recentInteractions.some((interaction) => interaction.threadId === thread.id);
    if (
      hasThreadInteraction &&
      memoryUpdatedAt &&
      (!latestMessageAt || memoryUpdatedAt.getTime() >= latestMessageAt.getTime())
    ) {
      logger.info({ threadId, customerId: thread.customerId }, '[CustomerMemory] Thread interaction already summarized');
      return;
    }

    const nextMemory = await summarizeCustomerMemory({
      priorMemory,
      customer: thread.customer,
      closedThread: {
        id: thread.id,
        organizationId: thread.organizationId,
        customerId: thread.customerId,
        channelType: thread.channelType,
        tag: thread.tag,
        subject: thread.subject,
        aiSummary: thread.aiSummary,
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt,
        closedAt,
      },
      messages: thread.messages,
      spendSettings: readSpendSettings(thread.organization.settings),
    });

    const bounded = boundMemory(nextMemory);
    await db.customer.update({
      where: { id: thread.customerId },
      data: {
        memory: toJsonInput(bounded),
        memoryUpdatedAt: new Date(),
      },
    });

    logger.info({ threadId, customerId: thread.customerId }, '[CustomerMemory] Updated customer memory');
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : String(err), threadId }, '[CustomerMemory] Update failed');
    Sentry.captureException(err, { extra: { threadId, component: 'customer_memory' } });
  }
}

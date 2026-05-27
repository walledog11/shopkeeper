import type { Queue } from 'bullmq';
import {
  db,
  isSpendCapError,
  parseStoredMemory,
  toCustomerMemoryJson,
} from '@clerk/db';
import * as Sentry from '@sentry/node';
import { JOB } from '../constants.js';
import logger from '../logger.js';
import { enforceSpendCap, type GatewaySpendSettings } from '../llm-spend.js';
import type { CustomerMemoryJobData } from '../types.js';
import { summarizeCustomerMemory } from './customer-memory-summarizer.js';

export const CUSTOMER_MEMORY_STALE_AFTER_DAYS = 30;
export const CUSTOMER_MEMORY_STALE_BATCH_PER_ORG = 50;
const CUSTOMER_MEMORY_REFRESH_CONCURRENCY = 5;

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

function readSpendSettings(settings: unknown): GatewaySpendSettings | null {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return null;
  const raw = (settings as Record<string, unknown>).dailyLLMSpendCapUsd;
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

    const refreshable = customers.filter((customer) => customer.threads[0]);
    for (let i = 0; i < refreshable.length; i += CUSTOMER_MEMORY_REFRESH_CONCURRENCY) {
      await Promise.all(
        refreshable.slice(i, i + CUSTOMER_MEMORY_REFRESH_CONCURRENCY).map(async (customer) => {
          const latestClosedThread = customer.threads[0];
          await updateCustomerMemoryOnThreadClose(latestClosedThread.id, {
            organizationId: org.id,
            closedAt: latestClosedThread.updatedAt.toISOString(),
          });
          result.customersRefreshed += 1;
        }),
      );
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
    const priorMemory = parseStoredMemory(thread.customer.memory);
    const memoryUpdatedAt = thread.customer.memoryUpdatedAt;

    // Skip when prior memory already summarized this thread and no newer
    // customer/agent message has landed since. Two close events for the
    // same thread are idempotent; a separate close event for a different
    // thread still falls through and runs (its interaction isn't recorded
    // yet), so concurrent closes are not silently dropped.
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

    await db.customer.update({
      where: { id: thread.customerId },
      data: {
        memory: toCustomerMemoryJson(nextMemory),
        memoryUpdatedAt: new Date(),
      },
    });

    logger.info({ threadId, customerId: thread.customerId }, '[CustomerMemory] Updated customer memory');
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : String(err), threadId }, '[CustomerMemory] Update failed');
    Sentry.captureException(err, { extra: { threadId, component: 'customer_memory' } });
  }
}

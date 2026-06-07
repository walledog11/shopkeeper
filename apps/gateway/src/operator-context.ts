/**
 * Operator-channel conversation context.
 *
 * Persists per-(org, chatId) state in the operator_contexts table. The chatId
 * is the Telegram chat id (string-encoded int64).
 */

import { db, Prisma } from '@shopkeeper/db';
import type { Prisma as PrismaTypes } from '@prisma/client';

const MAX_HISTORY_TURNS = 20;

export interface ToolCall {
  id: string;
  name: string;
  [key: string]: unknown;
}

export interface PendingPlan {
  threadId: string;
  instruction: string;
  rawToolCalls: ToolCall[];
}

export interface PendingDigest {
  threadIds: string[];
  sentAt: string;
}

export interface OperatorContext {
  lastOrderNumber: string | null;
  lastThreadId: string | null;
  history: { role: string; content: string }[];
  pendingPlan: PendingPlan | null;
  pendingDigest: PendingDigest | null;
}

const EMPTY: OperatorContext = {
  lastOrderNumber: null,
  lastThreadId: null,
  history: [],
  pendingPlan: null,
  pendingDigest: null,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function readHistory(value: unknown): OperatorContext['history'] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!isRecord(item) || typeof item.role !== 'string' || typeof item.content !== 'string') {
        return null;
      }
      return { role: item.role, content: item.content };
    })
    .filter((item): item is OperatorContext['history'][number] => item !== null);
}

function readToolCall(value: unknown): ToolCall | null {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.name !== 'string') {
    return null;
  }
  return { ...value, id: value.id, name: value.name };
}

function readPendingPlan(value: unknown): PendingPlan | null {
  if (
    !isRecord(value) ||
    typeof value.threadId !== 'string' ||
    typeof value.instruction !== 'string' ||
    !Array.isArray(value.rawToolCalls)
  ) {
    return null;
  }

  return {
    threadId: value.threadId,
    instruction: value.instruction,
    rawToolCalls: value.rawToolCalls
      .map(readToolCall)
      .filter((toolCall): toolCall is ToolCall => toolCall !== null),
  };
}

function readPendingDigest(value: unknown): PendingDigest | null {
  if (
    !isRecord(value) ||
    !Array.isArray(value.threadIds) ||
    typeof value.sentAt !== 'string'
  ) {
    return null;
  }

  return {
    threadIds: value.threadIds.filter((threadId): threadId is string => typeof threadId === 'string'),
    sentAt: value.sentAt,
  };
}

function toJsonObject(value: PendingPlan | PendingDigest): PrismaTypes.InputJsonObject {
  return JSON.parse(JSON.stringify(value)) as PrismaTypes.InputJsonObject;
}

export async function getContext(organizationId: string, chatId: string): Promise<OperatorContext> {
  const row = await db.operatorContext.findUnique({
    where: { organizationId_chatId: { organizationId, chatId } },
  });
  if (!row) return { ...EMPTY };
  return {
    lastOrderNumber: row.lastOrderNumber ?? null,
    lastThreadId: row.lastThreadId ?? null,
    history: readHistory(row.history),
    pendingPlan: readPendingPlan(row.pendingPlan),
    pendingDigest: readPendingDigest(row.pendingDigest),
  };
}

export async function updateContext(
  organizationId: string,
  chatId: string,
  updates: Partial<OperatorContext>,
): Promise<void> {
  const current = await getContext(organizationId, chatId);
  const next = { ...current, ...updates };

  if (next.history.length > MAX_HISTORY_TURNS) {
    next.history = next.history.slice(-MAX_HISTORY_TURNS);
  }

  const data = {
    lastOrderNumber: next.lastOrderNumber ?? null,
    lastThreadId: next.lastThreadId ?? null,
    history: next.history,
    pendingPlan: next.pendingPlan ? toJsonObject(next.pendingPlan) : Prisma.DbNull,
    pendingDigest: next.pendingDigest ? toJsonObject(next.pendingDigest) : Prisma.DbNull,
  };

  await db.operatorContext.upsert({
    where: { organizationId_chatId: { organizationId, chatId } },
    update: data,
    create: { organizationId, chatId, ...data },
  });
}

/**
 * Extract the first order number from a message body.
 * Matches formats: #1234, order 1234, order #1234, ORDER-1234.
 */
export function extractOrderNumber(text: string): string | null {
  const match = text.match(/#(\d+)|order[- #]*(\d+)/i);
  if (!match) return null;
  return `#${match[1] || match[2]}`;
}

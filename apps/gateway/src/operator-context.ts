/**
 * Operator-channel conversation context.
 *
 * Persists per-(org, chatId) state in the operator_contexts table. The chatId
 * is the Telegram chat id (string-encoded int64).
 */

import { db, Prisma } from '@clerk/db';

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

export async function getContext(organizationId: string, chatId: string): Promise<OperatorContext> {
  const row = await db.operatorContext.findUnique({
    where: { organizationId_chatId: { organizationId, chatId } },
  });
  if (!row) return { ...EMPTY };
  return {
    lastOrderNumber: row.lastOrderNumber ?? null,
    lastThreadId: row.lastThreadId ?? null,
    history: Array.isArray(row.history) ? (row.history as { role: string; content: string }[]) : [],
    pendingPlan: row.pendingPlan ? (row.pendingPlan as unknown as PendingPlan) : null,
    pendingDigest: row.pendingDigest ? (row.pendingDigest as unknown as PendingDigest) : null,
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
    pendingPlan: next.pendingPlan ? (next.pendingPlan as object) : Prisma.DbNull,
    pendingDigest: next.pendingDigest ? (next.pendingDigest as object) : Prisma.DbNull,
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

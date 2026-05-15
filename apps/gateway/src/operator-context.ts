/**
 * Operator-channel conversation context.
 *
 * Persists per-(org, channel, chatId) state in the operator_contexts table.
 * Generalizes the older SMS-only sms-context.ts; keyed by `(organizationId, channel, chatId)`
 * where channel is "whatsapp" or "telegram" and chatId is the provider-side identifier
 * (E.164 phone for whatsapp, Telegram chat id as string for telegram).
 */

import { db, Prisma } from '@clerk/db';

const MAX_HISTORY_TURNS = 20;

export type OperatorChannel = 'whatsapp' | 'telegram';

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

export async function getContext(
  organizationId: string,
  channel: OperatorChannel,
  chatId: string,
): Promise<OperatorContext> {
  const row = await db.operatorContext.findUnique({
    where: { organizationId_channel_chatId: { organizationId, channel, chatId } },
  });
  if (!row) return { lastOrderNumber: null, lastThreadId: null, history: [], pendingPlan: null, pendingDigest: null };
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
  channel: OperatorChannel,
  chatId: string,
  updates: Partial<OperatorContext>,
): Promise<void> {
  const current = await getContext(organizationId, channel, chatId);
  const next = { ...current, ...updates };

  if (next.history && next.history.length > MAX_HISTORY_TURNS) {
    next.history = next.history.slice(-MAX_HISTORY_TURNS);
  }

  await db.operatorContext.upsert({
    where: { organizationId_channel_chatId: { organizationId, channel, chatId } },
    update: {
      lastOrderNumber: next.lastOrderNumber ?? null,
      lastThreadId: next.lastThreadId ?? null,
      history: next.history,
      pendingPlan: next.pendingPlan ? (next.pendingPlan as object) : Prisma.DbNull,
      pendingDigest: next.pendingDigest ? (next.pendingDigest as object) : Prisma.DbNull,
    },
    create: {
      organizationId,
      channel,
      chatId,
      lastOrderNumber: next.lastOrderNumber ?? null,
      lastThreadId: next.lastThreadId ?? null,
      history: next.history,
      pendingPlan: next.pendingPlan ? (next.pendingPlan as object) : Prisma.DbNull,
      pendingDigest: next.pendingDigest ? (next.pendingDigest as object) : Prisma.DbNull,
    },
  });
}

export async function clearContext(
  organizationId: string,
  channel: OperatorChannel,
  chatId: string,
): Promise<void> {
  await db.operatorContext.deleteMany({
    where: { organizationId, channel, chatId },
  });
}

/**
 * Extract the first order number from a message body.
 * Matches formats: #1234, order 1234, order #1234, ORDER-1234
 * Returns null if nothing found.
 */
export function extractOrderNumber(text: string): string | null {
  const match = text.match(/#(\d+)|order[- #]*(\d+)/i);
  if (!match) return null;
  const num = match[1] || match[2];
  return `#${num}`;
}

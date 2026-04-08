/**
 * SMS Conversation Context Manager
 *
 * Persists per-sender state in the DB (sms_contexts table) scoped to the org.
 * Replaces the Redis-based implementation that lost context on Redis restart.
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

export interface SmsContext {
  lastOrderNumber: string | null;
  lastThreadId: string | null;
  history: { role: string; content: string }[];
  pendingPlan: PendingPlan | null;
}

export async function getContext(organizationId: string, phone: string): Promise<SmsContext> {
  const row = await db.smsContext.findUnique({
    where: { organizationId_phoneNumber: { organizationId, phoneNumber: phone } },
  });
  if (!row) return { lastOrderNumber: null, lastThreadId: null, history: [], pendingPlan: null };
  return {
    lastOrderNumber: row.lastOrderNumber ?? null,
    lastThreadId: row.lastThreadId ?? null,
    history: Array.isArray(row.history) ? (row.history as { role: string; content: string }[]) : [],
    pendingPlan: row.pendingPlan ? (row.pendingPlan as unknown as PendingPlan) : null,
  };
}

export async function updateContext(organizationId: string, phone: string, updates: Partial<SmsContext>): Promise<void> {
  const current = await getContext(organizationId, phone);
  const next = { ...current, ...updates };

  if (next.history && next.history.length > MAX_HISTORY_TURNS) {
    next.history = next.history.slice(-MAX_HISTORY_TURNS);
  }

  await db.smsContext.upsert({
    where: { organizationId_phoneNumber: { organizationId, phoneNumber: phone } },
    update: {
      lastOrderNumber: next.lastOrderNumber ?? null,
      lastThreadId: next.lastThreadId ?? null,
      history: next.history,
      pendingPlan: next.pendingPlan ? (next.pendingPlan as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
    },
    create: {
      organizationId,
      phoneNumber: phone,
      lastOrderNumber: next.lastOrderNumber ?? null,
      lastThreadId: next.lastThreadId ?? null,
      history: next.history,
      pendingPlan: next.pendingPlan ? (next.pendingPlan as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
    },
  });
}

export async function clearContext(organizationId: string, phone: string): Promise<void> {
  await db.smsContext.deleteMany({
    where: { organizationId, phoneNumber: phone },
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

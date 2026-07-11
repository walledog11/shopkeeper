/**
 * Operator-channel conversation context.
 *
 * Persists per-(org, chatId) state in the operator_contexts table. The chatId
 * is the Telegram chat id (string-encoded int64).
 */

import { db, Prisma } from '@shopkeeper/db';
import type { Prisma as PrismaTypes } from '@prisma/client';
import type { RawToolCall } from '@shopkeeper/agent/types';
import { isRecord } from './lib/typing.js';

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

export interface PendingQuestion {
  threadId: string;
  question: string;
}

export interface OperatorContext {
  pendingPlan: PendingPlan | null;
  pendingDigest: PendingDigest | null;
  pendingQuestion: PendingQuestion | null;
}

const EMPTY: OperatorContext = {
  pendingPlan: null,
  pendingDigest: null,
  pendingQuestion: null,
};

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

function readPendingQuestion(value: unknown): PendingQuestion | null {
  if (
    !isRecord(value) ||
    typeof value.threadId !== 'string' ||
    typeof value.question !== 'string'
  ) {
    return null;
  }

  return {
    threadId: value.threadId,
    question: value.question,
  };
}

function toJsonObject(value: PendingPlan | PendingDigest | PendingQuestion): PrismaTypes.InputJsonObject {
  return JSON.parse(JSON.stringify(value)) as PrismaTypes.InputJsonObject;
}

export async function getContext(organizationId: string, chatId: string): Promise<OperatorContext> {
  const row = await db.operatorContext.findUnique({
    where: { organizationId_chatId: { organizationId, chatId } },
  });
  if (!row) return { ...EMPTY };
  return {
    pendingPlan: readPendingPlan(row.pendingPlan),
    pendingDigest: readPendingDigest(row.pendingDigest),
    pendingQuestion: readPendingQuestion(row.pendingQuestion),
  };
}

export async function updateContext(
  organizationId: string,
  chatId: string,
  updates: Partial<OperatorContext>,
): Promise<void> {
  const current = await getContext(organizationId, chatId);
  const next = { ...current, ...updates };

  const data = {
    pendingPlan: next.pendingPlan ? toJsonObject(next.pendingPlan) : Prisma.DbNull,
    pendingDigest: next.pendingDigest ? toJsonObject(next.pendingDigest) : Prisma.DbNull,
    pendingQuestion: next.pendingQuestion ? toJsonObject(next.pendingQuestion) : Prisma.DbNull,
  };

  await db.operatorContext.upsert({
    where: { organizationId_chatId: { organizationId, chatId } },
    update: data,
    create: { organizationId, chatId, ...data },
  });
}

// Normalize a stored pending-plan's tool calls into the RawToolCall shape the
// approved-execution path expects. Legacy rows stored the input inline as sibling
// keys rather than under `input`; fold those back so approval fires the exact
// tool calls the merchant was shown.
export function normalizeApprovedToolCalls(toolCalls: ToolCall[]): RawToolCall[] {
  return toolCalls.map((toolCall) => {
    const { id, name, input, ...rest } = toolCall;
    return {
      id,
      name,
      input: input !== undefined ? input : (Object.keys(rest).length > 0 ? rest : undefined),
    };
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

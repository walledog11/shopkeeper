/**
 * Operator-channel conversation context.
 *
 * Persists per-(org, chatId) state in the operator_contexts table. The chatId
 * is the Telegram chat id (string-encoded int64).
 */

import { db, Prisma } from '@shopkeeper/db';
import type { Prisma as PrismaTypes } from '@prisma/client';
import type { RawToolCall } from '@shopkeeper/agent/types';
import type { ExpectedPlanIdentity } from '@shopkeeper/agent/plan-execution';
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
  // Optional for backward compatibility with operator_context rows written
  // before durable plan identity shipped. Every newly parked plan includes all
  // four fields; approval revalidates them against the live thread cache.
  planId?: string;
  sourceMessageId?: string;
  planHash?: string;
  instructionHash?: string;
  // Display-only, parked so the keyword fast path can name the concrete action
  // without re-querying. Never used to decide what executes.
  customerName?: string;
  actionLabel?: string;
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

export function expectedPlanIdentity(
  pendingPlan: PendingPlan,
): ExpectedPlanIdentity | undefined {
  if (!pendingPlan.planId && !pendingPlan.sourceMessageId && !pendingPlan.planHash && !pendingPlan.instructionHash) {
    return undefined;
  }
  return {
    planId: pendingPlan.planId,
    sourceMessageId: pendingPlan.sourceMessageId,
    planHash: pendingPlan.planHash,
    instructionHash: pendingPlan.instructionHash,
  };
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
    ...(typeof value.planId === 'string' ? { planId: value.planId } : {}),
    ...(typeof value.sourceMessageId === 'string' ? { sourceMessageId: value.sourceMessageId } : {}),
    ...(typeof value.planHash === 'string' ? { planHash: value.planHash } : {}),
    ...(typeof value.instructionHash === 'string' ? { instructionHash: value.instructionHash } : {}),
    ...(typeof value.customerName === 'string' ? { customerName: value.customerName } : {}),
    ...(typeof value.actionLabel === 'string' ? { actionLabel: value.actionLabel } : {}),
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

// Resolve only the exact parked plan that was acted on. New plans are cleared
// across every bound device by stable planId. Legacy JSON is cleared only on
// the acting device and only if the full parked value still matches, preserving
// a newer notification that may have arrived during execution.
export async function resolvePendingPlanContexts(
  organizationId: string,
  chatId: string,
  expected: PendingPlan,
): Promise<void> {
  if (expected.planId) {
    await db.operatorContext.updateMany({
      where: {
        organizationId,
        pendingPlan: { path: ['planId'], equals: expected.planId },
      },
      data: { pendingPlan: Prisma.DbNull },
    });
    return;
  }

  await db.operatorContext.updateMany({
    where: {
      organizationId,
      chatId,
      pendingPlan: { equals: toJsonObject(expected) },
    },
    data: { pendingPlan: Prisma.DbNull },
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

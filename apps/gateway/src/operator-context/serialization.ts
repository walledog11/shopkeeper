import type { Prisma as PrismaTypes } from '@prisma/client';
import type { PlanValidation, PlanValidationIssue } from '@shopkeeper/agent/types';
import type { ExpectedPlanIdentity } from '@shopkeeper/agent/plan-execution';
import { isRecord } from '../lib/typing.js';
import { readRequestDisplay, type RequestDisplay } from '../message-handlers/shared/request-display.js';

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
  /** Display/control metadata only. Invalid calls are never executable. */
  validation?: PlanValidation;
  /** Immutable request copy used by every operator rendering surface. */
  requestDisplay?: RequestDisplay;
}

export function isPendingPlanInvalid(plan: Pick<PendingPlan, 'validation'>): boolean {
  return plan.validation?.status === 'invalid';
}

/**
 * One numbered entry in the briefing the merchant is looking at.
 *
 * The briefing used to print two independent lists — parked approvals numbered
 * from 1, flagged tickets numbered from 1 again — so a reply of "1 yes" named
 * two different tickets and neither side could tell which. Everything that needs
 * the merchant is now one list in one order, and this is that order.
 *
 * `kind` is what a number means when it is used, not how the line reads:
 * - `approval` has a drafted plan; a bare yes executes it.
 * - `decision` is a thread the agent could not plan; there is nothing to
 *   approve, so a number here needs an instruction with it.
 * - `flagged` is a classifier maybe.
 *
 * `kind` says what a bare number does, never what the merchant is allowed to ask
 * for. Replying to a ticket and binning it as spam are inbox actions scoped by
 * `canonicalInboxThreadWhere`, so they reach any of these — see
 * `operator-inbox-tools.ts`. Gating them on `kind` is what made the two
 * "needs your decision" items in a briefing unactionable by the tools that exist
 * to act on briefing items.
 */
export interface PendingDigestItem {
  threadId: string;
  kind: 'approval' | 'decision' | 'flagged';
  /** Set for `approval`, linking the ordinal to its entry in `pendingPlans`. */
  planId?: string;
  /** The request was not shown, so approval/decision commands must fail closed. */
  needsThreadReview?: boolean;
}

/**
 * `items` is the whole briefing, in the order the merchant read it, and it is the
 * only list. A `threadIds` field carrying just the flagged subset used to sit
 * beside it and was still the gate on the reply/spam tools after the ordinals had
 * moved on: a briefing whose needs-you items were all approvals and escalations
 * wrote `threadIds: []` and every triage call failed "not in the current digest".
 * The field is now write-only (see `serializePendingDigest`) so nothing can gate
 * on it again.
 */
export interface PendingDigest {
  items: PendingDigestItem[];
  sentAt: string;
}

const DIGEST_ITEM_KINDS = new Set(['approval', 'decision', 'flagged']);

/**
 * The number the merchant saw next to this thread. Every ordinal the operator
 * side prints or accepts has to come from here, so that "2" means the same
 * ticket in the briefing, in a confirmation, and in the ledger the model reads.
 */
export function briefingOrdinal(digest: PendingDigest | null, threadId: string): number | null {
  const index = digest?.items.findIndex((item) => item.threadId === threadId) ?? -1;
  return index < 0 ? null : index + 1;
}

export function pendingPlanNeedsThreadReview(
  plan: PendingPlan,
  digest: PendingDigest | null | undefined,
): boolean {
  return digest?.items.some((item) => (
    item.needsThreadReview === true
    && ((plan.planId && item.planId === plan.planId) || item.threadId === plan.threadId)
  )) === true;
}

/**
 * The persisted shape. `threadIds` is a compatibility field only: the previous
 * deploy's `readPendingDigest` requires it to be an array, so a row written
 * without it would leave a rolled-back gateway with no pending digest at all.
 * Nothing reads it back into `PendingDigest`. Drop it once no deploy that
 * requires it can be rolled back to.
 */
export function serializePendingDigest(digest: PendingDigest): {
  items: PendingDigestItem[];
  sentAt: string;
  threadIds: string[];
} {
  return {
    items: digest.items,
    sentAt: digest.sentAt,
    threadIds: digest.items.flatMap((item) => (item.kind === 'flagged' ? [item.threadId] : [])),
  };
}

function readPendingDigestItems(value: unknown, threadIds: string[]): PendingDigestItem[] {
  if (!Array.isArray(value)) {
    // Pre-merge row: the only numbered list it ever had was the flagged one.
    return threadIds.map((threadId) => ({ threadId, kind: 'flagged' as const }));
  }
  return value.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.threadId !== 'string') return [];
    if (typeof entry.kind !== 'string' || !DIGEST_ITEM_KINDS.has(entry.kind)) return [];
    return [{
      threadId: entry.threadId,
      kind: entry.kind as PendingDigestItem['kind'],
      ...(typeof entry.planId === 'string' ? { planId: entry.planId } : {}),
      ...(entry.needsThreadReview === true ? { needsThreadReview: true } : {}),
    }];
  });
}

export interface PendingQuestion {
  threadId: string;
  question: string;
  planId?: string;
  sourceMessageId?: string;
}

export interface OperatorContext {
  // The pending-plan queue (A6-step-2), newest last, at most one entry per thread.
  // Bounded by OPERATOR_PLAN_QUEUE_MAX at park time.
  pendingPlans: PendingPlan[];
  // Convenience alias for the most-recent queued plan (the last element), or null.
  // The keyword fast path and single-plan callers read this; queue-aware callers
  // (ledger, control-tool selection, digest "waiting on you") read `pendingPlans`.
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

export const EMPTY_OPERATOR_CONTEXT: OperatorContext = {
  pendingPlans: [],
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

const PLAN_VALIDATION_CODES = new Set<PlanValidationIssue['code']>([
  'invalid_tool_input',
  'duplicate_tool_call_id',
  'already_refunded_action',
  'orphan_internal_note',
  'ungrounded_escalation_reason',
  'ungrounded_customer_reply',
  'multiple_customer_messages',
  'unbound_reply_placeholder',
]);

function readPlanValidationIssue(value: unknown): PlanValidationIssue | null {
  if (
    !isRecord(value)
    || typeof value.code !== 'string'
    || !PLAN_VALIDATION_CODES.has(value.code as PlanValidationIssue['code'])
    || typeof value.message !== 'string'
  ) {
    return null;
  }
  return {
    code: value.code as PlanValidationIssue['code'],
    message: value.message,
    ...(typeof value.toolCallId === 'string' ? { toolCallId: value.toolCallId } : {}),
    ...(typeof value.tool === 'string' ? { tool: value.tool } : {}),
  };
}

function readPlanValidation(value: unknown): PlanValidation | undefined {
  if (!isRecord(value)) return undefined;
  if (value.status === 'valid' && Array.isArray(value.issues) && value.issues.length === 0) {
    return { status: 'valid', issues: [] };
  }
  if (value.status !== 'invalid') return undefined;
  if (!Array.isArray(value.issues)) {
    return {
      status: 'invalid',
      issues: [{ code: 'invalid_tool_input', message: 'Stored draft validation metadata is malformed.' }],
    };
  }
  const issues = value.issues
    .map(readPlanValidationIssue)
    .filter((issue): issue is PlanValidationIssue => issue !== null);
  return issues.length > 0 && issues.length === value.issues.length
    ? { status: 'invalid', issues }
    : {
        status: 'invalid',
        issues: [{ code: 'invalid_tool_input', message: 'Stored draft validation metadata is malformed.' }],
      };
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

  const validation = readPlanValidation(value.validation);
  const requestDisplay = readRequestDisplay(value.requestDisplay);
  return {
    threadId: value.threadId,
    instruction: value.instruction,
    ...(typeof value.planId === 'string' ? { planId: value.planId } : {}),
    ...(typeof value.sourceMessageId === 'string' ? { sourceMessageId: value.sourceMessageId } : {}),
    ...(typeof value.planHash === 'string' ? { planHash: value.planHash } : {}),
    ...(typeof value.instructionHash === 'string' ? { instructionHash: value.instructionHash } : {}),
    ...(typeof value.customerName === 'string' ? { customerName: value.customerName } : {}),
    ...(typeof value.actionLabel === 'string' ? { actionLabel: value.actionLabel } : {}),
    ...(validation ? { validation } : {}),
    ...(requestDisplay ? { requestDisplay } : {}),
    rawToolCalls: value.rawToolCalls
      .map(readToolCall)
      .filter((toolCall): toolCall is ToolCall => toolCall !== null),
  };
}

export function parseStoredPendingPlan(value: unknown): PendingPlan | null {
  return readPendingPlan(value);
}

export function readPendingPlanArray(value: unknown): PendingPlan[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(readPendingPlan)
    .filter((plan): plan is PendingPlan => plan !== null);
}

// The most-recent queued plan is the last element (newest-last ordering). The
// keyword fast path and any single-plan caller act on this one.
export function mostRecentPendingPlan(plans: PendingPlan[]): PendingPlan | null {
  return plans.length > 0 ? plans[plans.length - 1]! : null;
}

export function readPendingDigest(value: unknown): PendingDigest | null {
  if (!isRecord(value) || typeof value.sentAt !== 'string') return null;

  // Legacy rows carry only `threadIds`; current rows carry `items` and write
  // `threadIds` for rollback. Either alone is enough to rebuild the list.
  const threadIds = Array.isArray(value.threadIds)
    ? value.threadIds.filter((threadId): threadId is string => typeof threadId === 'string')
    : [];
  if (!Array.isArray(value.items) && threadIds.length === 0) return null;

  return {
    items: readPendingDigestItems(value.items, threadIds),
    sentAt: value.sentAt,
  };
}

export function readPendingQuestion(value: unknown): PendingQuestion | null {
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
    ...(typeof value.planId === 'string' ? { planId: value.planId } : {}),
    ...(typeof value.sourceMessageId === 'string' ? { sourceMessageId: value.sourceMessageId } : {}),
  };
}

export function toJsonObject(value: PendingPlan | PendingQuestion): PrismaTypes.InputJsonObject {
  return JSON.parse(JSON.stringify(value)) as PrismaTypes.InputJsonObject;
}

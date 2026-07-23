/**
 * Operator-channel conversation context.
 *
 * Persists per-(org, channel-context key) state in operator_contexts. The key is
 * a Telegram chat id (string-encoded int64) or an iMessage sender id. Those
 * identifier spaces are currently disjoint; a future shared-key migration must
 * add an explicit channel column before changing that assumption.
 */

import { db, Prisma } from '@shopkeeper/db';
import type { Prisma as PrismaTypes } from '@prisma/client';
import type { RawToolCall } from '@shopkeeper/agent/types';
import type { ExpectedPlanIdentity } from '@shopkeeper/agent/plan-execution';
import { getPlanExecution } from '@shopkeeper/agent/execution-ledger';
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

const EMPTY: OperatorContext = {
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

export function parseStoredPendingPlan(value: unknown): PendingPlan | null {
  return readPendingPlan(value);
}

function readPendingPlanArray(value: unknown): PendingPlan[] {
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

  let pendingPlans = readPendingPlanArray(row.pendingPlans);
  // Dual-read: a plan parked in the legacy single slot before this release (the
  // migration backfills existing rows; an old instance could still park there
  // during a rolling deploy) surfaces as a one-item queue.
  if (pendingPlans.length === 0) {
    const legacy = readPendingPlan(row.pendingPlan);
    if (legacy) pendingPlans = [legacy];
  }

  return {
    pendingPlans,
    pendingPlan: mostRecentPendingPlan(pendingPlans),
    pendingDigest: readPendingDigest(row.pendingDigest),
    pendingQuestion: readPendingQuestion(row.pendingQuestion),
  };
}

// Write only the slots present in `updates`, never a read-modify-write of all
// three. A plan-card fan-out setting `pendingPlan` and an operator turn clearing
// `pendingQuestion` therefore touch different columns and cannot clobber each
// other: each concurrent call emits an UPDATE that SETs only its own column, so
// Postgres serializes them on the row lock and both land. Slots not named in
// `updates` are left exactly as stored.
//
// The `pendingPlan` key is the legacy single-plan API: it *replaces* the whole
// queue with `[plan]` (or clears it) and nulls the dead singular column. Parking
// that must preserve other threads' queued plans goes through `appendPendingPlan`,
// not here.
export async function updateContext(
  organizationId: string,
  chatId: string,
  updates: Partial<Omit<OperatorContext, 'pendingPlans'>>,
): Promise<void> {
  const data: {
    pendingPlan?: typeof Prisma.DbNull;
    pendingPlans?: PrismaTypes.InputJsonValue | typeof Prisma.DbNull;
    pendingDigest?: PrismaTypes.InputJsonValue | typeof Prisma.DbNull;
    pendingQuestion?: PrismaTypes.InputJsonValue | typeof Prisma.DbNull;
  } = {};
  if ('pendingPlan' in updates) {
    data.pendingPlans = updates.pendingPlan ? [toJsonObject(updates.pendingPlan)] : Prisma.DbNull;
    data.pendingPlan = Prisma.DbNull;
  }
  if ('pendingDigest' in updates) {
    data.pendingDigest = updates.pendingDigest ? toJsonObject(updates.pendingDigest) : Prisma.DbNull;
  }
  if ('pendingQuestion' in updates) {
    data.pendingQuestion = updates.pendingQuestion ? toJsonObject(updates.pendingQuestion) : Prisma.DbNull;
  }

  await db.operatorContext.upsert({
    where: { organizationId_chatId: { organizationId, chatId } },
    update: data,
    create: { organizationId, chatId, ...data },
  });
}

// Resolve only the exact parked plan that was acted on by removing that one
// element from the queue (and clearing a matching legacy single slot), leaving
// every sibling plan intact. New plans resolve across every bound device by
// stable planId. Legacy identity-less plans resolve only on the acting device and
// only if the full parked value still matches, preserving a newer notification
// that may have arrived during execution. Each raw UPDATE is a single atomic
// statement, so the removal races cleanly against a concurrent `appendPendingPlan`
// on the same row (they serialize on the row lock).
export async function resolvePendingPlanContexts(
  organizationId: string,
  chatId: string,
  expected: PendingPlan,
): Promise<void> {
  if (expected.planId) {
    const planId = expected.planId;
    const planIdMatch = JSON.stringify([{ planId }]);
    await db.$executeRaw`
      UPDATE operator_contexts
      SET pending_plans = COALESCE((
            SELECT jsonb_agg(element)
            FROM jsonb_array_elements(COALESCE(pending_plans, '[]'::jsonb)) AS element
            WHERE element->>'planId' IS DISTINCT FROM ${planId}
          ), '[]'::jsonb),
          pending_plan = CASE WHEN pending_plan->>'planId' = ${planId} THEN NULL ELSE pending_plan END
      WHERE organization_id = ${organizationId}::uuid
        AND (
          pending_plans @> ${planIdMatch}::jsonb
          OR pending_plan->>'planId' = ${planId}
        )`;
    return;
  }

  const expectedJson = JSON.stringify(toJsonObject(expected));
  const expectedContains = JSON.stringify([toJsonObject(expected)]);
  await db.$executeRaw`
    UPDATE operator_contexts
    SET pending_plans = COALESCE((
          SELECT jsonb_agg(element)
          FROM jsonb_array_elements(COALESCE(pending_plans, '[]'::jsonb)) AS element
          WHERE element <> ${expectedJson}::jsonb
        ), '[]'::jsonb),
        pending_plan = CASE WHEN pending_plan = ${expectedJson}::jsonb THEN NULL ELSE pending_plan END
    WHERE organization_id = ${organizationId}::uuid AND chat_id = ${chatId}
      AND (
        pending_plans @> ${expectedContains}::jsonb
        OR pending_plan = ${expectedJson}::jsonb
      )`;
}

// Remove any queued plan for one thread across every bound device (and clear a
// matching legacy single slot), leaving other threads' plans intact. Used when a
// thread transitions from "plan drafted" to "question pending" — its old plan is
// superseded, but a whole-queue clear would silently drop unrelated threads'
// plans (the A6 harm). Atomic single statement.
export async function removePendingPlanForThread(
  organizationId: string,
  threadId: string,
): Promise<void> {
  const threadMatch = JSON.stringify([{ threadId }]);
  await db.$executeRaw`
    UPDATE operator_contexts
    SET pending_plans = COALESCE((
          SELECT jsonb_agg(element)
          FROM jsonb_array_elements(COALESCE(pending_plans, '[]'::jsonb)) AS element
          WHERE element->>'threadId' IS DISTINCT FROM ${threadId}
        ), '[]'::jsonb),
        pending_plan = CASE WHEN pending_plan->>'threadId' = ${threadId} THEN NULL ELSE pending_plan END
    WHERE organization_id = ${organizationId}::uuid
      AND (
        pending_plans @> ${threadMatch}::jsonb
        OR pending_plan->>'threadId' = ${threadId}
      )`;
}

// Park a plan on the queue, upserting by threadId (a thread holds at most one
// pending plan) and trimming to the newest `maxDepth`. The row-lock transaction
// serializes concurrent parks so none is lost, and the threadId upsert makes the
// append idempotent under BullMQ retry — re-appending the same plan yields one
// entry. Nulls the dead legacy single slot on every write.
export async function appendPendingPlan(
  organizationId: string,
  chatId: string,
  plan: PendingPlan,
  maxDepth: number,
): Promise<void> {
  const depth = Math.max(1, Math.floor(maxDepth));
  await db.$transaction(async (tx) => {
    // Ensure the row exists race-safely: a plain upsert SELECT-then-INSERTs, so two
    // concurrent first parks both INSERT and one hits the unique constraint. ON
    // CONFLICT DO NOTHING is atomic and blocks on the index until the other commits.
    await tx.$executeRaw`
      INSERT INTO operator_contexts (id, organization_id, chat_id, updated_at)
      VALUES (gen_random_uuid(), ${organizationId}::uuid, ${chatId}, now())
      ON CONFLICT (organization_id, chat_id) DO NOTHING`;
    // Lock the row so concurrent parks serialize here; a plain findUnique under
    // Read Committed would let two parks read the same array and drop one.
    await tx.$queryRaw`
      SELECT 1 FROM operator_contexts
      WHERE organization_id = ${organizationId}::uuid AND chat_id = ${chatId}
      FOR UPDATE`;
    const row = await tx.operatorContext.findUnique({
      where: { organizationId_chatId: { organizationId, chatId } },
      select: { pendingPlans: true },
    });
    const current = readPendingPlanArray(row?.pendingPlans);
    const next = [
      ...current.filter((existing) => existing.threadId !== plan.threadId),
      plan,
    ].slice(-depth);
    await tx.operatorContext.update({
      where: { organizationId_chatId: { organizationId, chatId } },
      data: { pendingPlans: next.map(toJsonObject), pendingPlan: Prisma.DbNull },
    });
  });
}

export type SelectPendingPlanResult =
  | { plan: PendingPlan }
  | { error: string };

function summarizePendingPlan(plan: PendingPlan): string {
  const who = plan.customerName ? plan.customerName.split(' ')[0] : 'the customer';
  const what = plan.actionLabel ?? plan.instruction;
  return `${who} — ${what}`;
}

function pendingPlanOptions(plans: PendingPlan[]): string {
  return plans.map((plan, index) => `${index + 1}. ${summarizePendingPlan(plan)}`).join('; ');
}

// Resolve which queued plan a control tool should act on from the model's
// optional `plan_ref` (an ordinal from the ledger list, a planId, or a customer
// name). With one plan pending the ref is ignored; with several and no/ambiguous
// ref the model is told to ask which one rather than guess.
export function selectPendingPlan(plans: PendingPlan[], ref?: string): SelectPendingPlanResult {
  if (plans.length === 0) {
    return { error: 'Error: no plan is awaiting the merchant\'s approval.' };
  }
  if (plans.length === 1) {
    return { plan: plans[0]! };
  }

  const trimmed = ref?.trim();
  const ambiguous = `Multiple plans are pending — ask which one before acting: ${pendingPlanOptions(plans)}.`;
  if (!trimmed) {
    return { error: ambiguous };
  }

  if (/^\d+$/.test(trimmed)) {
    const index = Number.parseInt(trimmed, 10) - 1;
    if (index >= 0 && index < plans.length) return { plan: plans[index]! };
    return { error: ambiguous };
  }

  const byPlanId = plans.filter((plan) => plan.planId === trimmed);
  if (byPlanId.length === 1) return { plan: byPlanId[0]! };

  const needle = trimmed.toLowerCase();
  const byName = plans.filter((plan) => plan.customerName?.toLowerCase().includes(needle));
  if (byName.length === 1) return { plan: byName[0]! };

  return { error: ambiguous };
}

// Drop queue entries whose plan already reached a terminal execution outcome
// (committed/failed/unknown) elsewhere — e.g. approved on the dashboard — so the
// operator turn never shows or acts on a dead plan. Each stale entry is removed
// atomically; `pending`/`claimed` executions stay (still actionable / in flight).
// Called once per turn before the ledger and control tools read the context.
export async function loadLivePendingPlans(
  organizationId: string,
  chatId: string,
  context: OperatorContext,
): Promise<OperatorContext> {
  if (context.pendingPlans.length === 0) return context;

  const live: PendingPlan[] = [];
  for (const plan of context.pendingPlans) {
    if (plan.planId) {
      const execution = await getPlanExecution(organizationId, plan.planId).catch(() => null);
      if (execution && execution.status !== 'pending' && execution.status !== 'claimed') {
        await resolvePendingPlanContexts(organizationId, chatId, plan).catch(() => undefined);
        continue;
      }
    }
    live.push(plan);
  }

  if (live.length === context.pendingPlans.length) return context;
  return { ...context, pendingPlans: live, pendingPlan: mostRecentPendingPlan(live) };
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

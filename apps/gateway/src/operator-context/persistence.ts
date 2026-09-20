import { db, Prisma } from '@shopkeeper/db';
import type { Prisma as PrismaTypes } from '@prisma/client';
import type { RawToolCall } from '@shopkeeper/agent/types';
import { getPlanExecution } from '@shopkeeper/agent/execution-ledger';
import { AGENT_PLAN_CACHE_VERSION, readAgentPlanCacheRecordShape } from '@shopkeeper/agent/plan-cache-shape';
import { hashInstruction, hashPlan } from '@shopkeeper/agent/agent-actions';
import logger from '../logger.js';
import {
  briefingOrdinal,
  EMPTY_OPERATOR_CONTEXT,
  mostRecentPendingPlan,
  pendingPlanNeedsThreadReview,
  readPendingPlanArray,
  readPendingDigest,
  readPendingQuestion,
  serializePendingDigest,
  toJsonObject,
  type OperatorContext,
  type PendingDigest,
  type PendingPlan,
  type PendingQuestion,
  type ToolCall,
} from './serialization.js';

export async function getContext(organizationId: string, memberKey: string): Promise<OperatorContext> {
  const row = await db.operatorContext.findUnique({
    where: { organizationId_memberKey: { organizationId, memberKey } },
  });
  if (!row) return { ...EMPTY_OPERATOR_CONTEXT };

  const pendingPlans = readPendingPlanArray(row.pendingPlans);

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
// The `pendingPlan` key replaces the whole queue with `[plan]` (or clears it).
// Parking that must preserve other threads' queued plans goes through
// `appendPendingPlan`, not here.
export async function updateContext(
  organizationId: string,
  memberKey: string,
  updates: Partial<Omit<OperatorContext, 'pendingPlans'>>,
): Promise<void> {
  const data: {
    pendingPlans?: PrismaTypes.InputJsonValue | typeof Prisma.DbNull;
    pendingDigest?: PrismaTypes.InputJsonValue | typeof Prisma.DbNull;
    pendingQuestion?: PrismaTypes.InputJsonValue | typeof Prisma.DbNull;
  } = {};
  if ('pendingPlan' in updates) {
    data.pendingPlans = updates.pendingPlan ? [toJsonObject(updates.pendingPlan)] : Prisma.DbNull;
  }
  if ('pendingDigest' in updates) {
    data.pendingDigest = updates.pendingDigest
      ? (JSON.parse(JSON.stringify(serializePendingDigest(updates.pendingDigest))) as PrismaTypes.InputJsonObject)
      : Prisma.DbNull;
  }
  if ('pendingQuestion' in updates) {
    data.pendingQuestion = updates.pendingQuestion ? toJsonObject(updates.pendingQuestion) : Prisma.DbNull;
  }

  await db.operatorContext.upsert({
    where: { organizationId_memberKey: { organizationId, memberKey } },
    update: data,
    create: { organizationId, memberKey, ...data },
  });
}

// Resolve only the exact parked plan that was acted on by removing that one
// element from the queue, leaving every sibling plan intact. New plans resolve
// across every operator in the org
// by stable planId — a teammate's queue must not keep offering a plan someone
// already ran. Legacy identity-less plans resolve only on the acting member's own
// queue and only if the full parked value still matches, preserving a newer
// notification that may have arrived during execution. Each raw UPDATE is a
// single atomic statement, so the removal races cleanly against a concurrent
// `appendPendingPlan` on the same row (they serialize on the row lock).
export async function resolvePendingPlanContexts(
  organizationId: string,
  memberKey: string,
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
          ), '[]'::jsonb)
      WHERE organization_id = ${organizationId}::uuid
        AND pending_plans @> ${planIdMatch}::jsonb`;
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
        ), '[]'::jsonb)
    WHERE organization_id = ${organizationId}::uuid AND member_key = ${memberKey}
      AND pending_plans @> ${expectedContains}::jsonb`;
}

// Remove any queued plan for one thread across every operator in the org,
// leaving other threads' plans intact. Used when a
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
        ), '[]'::jsonb)
    WHERE organization_id = ${organizationId}::uuid
      AND pending_plans @> ${threadMatch}::jsonb`;
}

// Park a plan on the queue, upserting by threadId (a thread holds at most one
// pending plan) and trimming to the newest `maxDepth`. The row-lock transaction
// serializes concurrent parks so none is lost, and the threadId upsert makes the
// append idempotent under BullMQ retry — re-appending the same plan yields one
// entry.
export async function appendPendingPlan(
  organizationId: string,
  memberKey: string,
  plan: PendingPlan,
  maxDepth: number,
): Promise<void> {
  const depth = Math.max(1, Math.floor(maxDepth));
  await db.$transaction(async (tx) => {
    // Ensure the row exists race-safely: a plain upsert SELECT-then-INSERTs, so two
    // concurrent first parks both INSERT and one hits the unique constraint. ON
    // CONFLICT DO NOTHING is atomic and blocks on the index until the other commits.
    await tx.$executeRaw`
      INSERT INTO operator_contexts (id, organization_id, member_key, updated_at)
      VALUES (gen_random_uuid(), ${organizationId}::uuid, ${memberKey}, now())
      ON CONFLICT (organization_id, member_key) DO NOTHING`;
    // Lock the row so concurrent parks serialize here; a plain findUnique under
    // Read Committed would let two parks read the same array and drop one.
    await tx.$queryRaw`
      SELECT 1 FROM operator_contexts
      WHERE organization_id = ${organizationId}::uuid AND member_key = ${memberKey}
      FOR UPDATE`;
    const row = await tx.operatorContext.findUnique({
      where: { organizationId_memberKey: { organizationId, memberKey } },
      select: { pendingPlans: true },
    });
    const current = readPendingPlanArray(row?.pendingPlans);
    const next = [
      ...current.filter((existing) => existing.threadId !== plan.threadId),
      plan,
    ].slice(-depth);
    await tx.operatorContext.update({
      where: { organizationId_memberKey: { organizationId, memberKey } },
      data: { pendingPlans: next.map(toJsonObject) },
    });
  });
}

// `code` distinguishes "nothing is queued" from "several are, say which" —
// callers must not tell those apart by reading the sentence. Only the first
// means the merchant adjudicated something that is not there.
export type SelectPendingPlanResult =
  | { plan: PendingPlan }
  | { error: string; code: 'none_pending' | 'needs_disambiguation' | 'needs_thread_review' };

function summarizePendingPlan(plan: PendingPlan): string {
  const who = plan.customerName ? plan.customerName.split(' ')[0] : 'the customer';
  const what = plan.actionLabel ?? plan.instruction;
  return `${who} — ${what}`;
}

function pendingPlanOptions(plans: PendingPlan[], digest?: PendingDigest | null): string {
  return plans.map((plan, index) => {
    const item = digest?.items.find((entry) => entry.threadId === plan.threadId);
    const ordinal = !item?.planId || item.planId === plan.planId
      ? briefingOrdinal(digest ?? null, plan.threadId) : null;
    const reference = ordinal ?? (digest?.items.length ? plan.planId ?? plan.customerName : index + 1);
    return `${reference ?? 'Pending plan'}. ${summarizePendingPlan(plan)}`;
  }).join('; ');
}

// Resolve which queued plan a control tool should act on from the model's
// optional `plan_ref` (an ordinal from the ledger list, a planId, or a customer
// name). An explicit ref is always honored, even if only one plan remains.
export function selectPendingPlan(
  plans: PendingPlan[],
  ref?: string,
  digest?: PendingDigest | null,
): SelectPendingPlanResult {
  if (plans.length === 0) {
    return { error: 'Error: no plan is awaiting the merchant\'s approval.', code: 'none_pending' };
  }
  const selectable = (plan: PendingPlan): SelectPendingPlanResult => {
    const briefingItem = digest?.items.find((item) => item.threadId === plan.threadId
      && (!item.planId || item.planId === plan.planId));
    if (briefingItem && briefingItem.kind !== 'approval') {
      return { error: 'This conversation needs an instruction, not approval. Read the request and ask what the merchant wants done.', code: 'needs_thread_review' };
    }
    if (pendingPlanNeedsThreadReview(plan, digest)) {
      return {
        error: 'The request details were unavailable in the briefing. Open the thread before approving this plan.',
        code: 'needs_thread_review',
      };
    }
    return { plan };
  };
  const trimmed = ref?.trim();
  if (plans.length === 1 && !trimmed) {
    return selectable(plans[0]!);
  }

  const ambiguous = plans.length > 1
    ? `Multiple plans are pending — ask which one before acting: ${pendingPlanOptions(plans, digest)}.`
    : `That reference does not match the pending plan. Ask the merchant to confirm: ${pendingPlanOptions(plans, digest)}.`;
  if (!trimmed) {
    return { error: ambiguous, code: 'needs_disambiguation' };
  }

  if (/^\d+$/.test(trimmed)) {
    const ordinal = Number.parseInt(trimmed, 10);

    // A number the merchant types is a number they read in the briefing, so the
    // briefing's list wins over this queue's own order whenever one was sent.
    // The two agreed only by accident — the queue is newest-last and the briefing
    // lists approvals first — and disagreed the moment anything else was on the
    // list above them.
    const item = digest?.items[ordinal - 1];
    if (item) {
      if (item.needsThreadReview) {
        return { error: 'Open the thread to read the original request before acting on this conversation.', code: 'needs_thread_review' };
      }
      if (item.kind !== 'approval') {
        return {
          error: `Number ${ordinal} in the briefing is not a drafted plan, so there is nothing to approve. Tell the merchant what it is and ask what they want done.`,
          code: 'needs_thread_review',
        };
      }
      const byOrdinal = item.planId
        ? plans.find((plan) => plan.planId === item.planId && plan.threadId === item.threadId)
        : plans.find((plan) => plan.threadId === item.threadId);
      if (byOrdinal) return selectable(byOrdinal);
      return { error: `The plan for number ${ordinal} is no longer pending — it may already have run.`, code: 'needs_disambiguation' };
    }
    if (digest && digest.items.length > 0) {
      return { error: `There is no number ${ordinal} on that briefing. ${ambiguous}`, code: 'needs_disambiguation' };
    }

    const index = ordinal - 1;
    if (index >= 0 && index < plans.length) return selectable(plans[index]!);
    return { error: ambiguous, code: 'needs_disambiguation' };
  }

  const byPlanId = plans.filter((plan) => plan.planId === trimmed);
  if (byPlanId.length === 1) return selectable(byPlanId[0]!);

  const needle = trimmed.toLowerCase();
  const byName = plans.filter((plan) => plan.customerName?.toLowerCase().includes(needle));
  if (byName.length === 1) return selectable(byName[0]!);

  return { error: ambiguous, code: 'needs_disambiguation' };
}

/**
 * Why a parked plan is no longer offerable, or null when it still is.
 *
 * Six separate conditions used to collapse into one boolean, so a card the
 * merchant was looking at could be discarded and the only trace was that their
 * "yes" met an empty queue. Reconstructing which condition fired took a
 * production forensic pass with the logs already expired (2026-09-10). Each one
 * now names itself.
 */
type PendingPlanStaleReason =
  | 'identity_incomplete'
  | 'cache_absent'
  | 'cache_version_superseded'
  | 'plan_replaced'
  | 'source_message_advanced'
  | 'plan_edited'
  | 'instruction_changed';

async function pendingPlanStaleReason(
  organizationId: string,
  plan: PendingPlan,
): Promise<PendingPlanStaleReason | null> {
  // Identity-less queue entries predate durable approval and cannot describe a
  // current cache unambiguously. Do not offer them and wait for an approval to
  // discover that they are stale.
  if (!plan.planId || !plan.sourceMessageId || !plan.planHash || !plan.instructionHash) {
    return 'identity_incomplete';
  }
  const thread = await db.thread.findFirst({
    where: { id: plan.threadId, organizationId },
    select: { cachedPlan: true, cachedPlanMessageId: true },
  });
  const cached = readAgentPlanCacheRecordShape(thread?.cachedPlan);
  if (!cached) return 'cache_absent';
  if (cached.version !== AGENT_PLAN_CACHE_VERSION) return 'cache_version_superseded';
  if (cached.planId !== plan.planId) return 'plan_replaced';
  if (cached.lastCustomerMessageId !== plan.sourceMessageId) return 'source_message_advanced';
  if (thread?.cachedPlanMessageId !== plan.sourceMessageId) return 'source_message_advanced';
  if (hashPlan(cached.plan) !== plan.planHash) return 'plan_edited';
  if (hashInstruction(cached.instruction) !== plan.instructionHash) return 'instruction_changed';
  return null;
}

async function resolveStalePendingPlanContext(
  organizationId: string,
  memberKey: string,
  plan: PendingPlan,
): Promise<void> {
  if (plan.planId) {
    await resolvePendingPlanContexts(organizationId, memberKey, plan);
    return;
  }

  // Legacy entries can carry fields that the current parser deliberately drops.
  // Full-object equality would leave those rows parked forever. Remove only
  // identity-incomplete entries for this thread, so a concurrently parked v7
  // replacement (which has all four identity fields) survives the cleanup.
  const threadMatch = JSON.stringify([{ threadId: plan.threadId }]);
  await db.$executeRaw`
    UPDATE operator_contexts
    SET pending_plans = COALESCE((
          SELECT jsonb_agg(element)
          FROM jsonb_array_elements(COALESCE(pending_plans, '[]'::jsonb)) AS element
          WHERE element->>'threadId' IS DISTINCT FROM ${plan.threadId}
             OR (
               element->>'planId' IS NOT NULL
               AND element->>'sourceMessageId' IS NOT NULL
               AND element->>'planHash' IS NOT NULL
               AND element->>'instructionHash' IS NOT NULL
             )
        ), '[]'::jsonb)
    WHERE organization_id = ${organizationId}::uuid AND member_key = ${memberKey}
      AND pending_plans @> ${threadMatch}::jsonb`;
}

/**
 * Why a parked question is no longer answerable, or null when it still is.
 *
 * A question is not an authorization to execute — answering one records a fact
 * and re-plans the thread — so `pendingPlanStaleReason`'s identity conditions do
 * not carry over: a question with no plan identity is still answerable, and is
 * kept. What makes one stale is that the thing it was asked about is gone.
 */
type PendingQuestionStaleReason =
  | 'thread_absent'
  | 'thread_closed'
  | 'cache_absent'
  | 'plan_replaced';

async function pendingQuestionStaleReason(
  organizationId: string,
  question: PendingQuestion,
): Promise<PendingQuestionStaleReason | null> {
  const thread = await db.thread.findFirst({
    where: { id: question.threadId, organizationId, deletedAt: null },
    select: { status: true, cachedPlan: true },
  });
  if (!thread) return 'thread_absent';
  if (thread.status === 'closed') return 'thread_closed';
  // Questions parked by a plan that carried no identity have nothing to compare
  // against. The thread is open, so keep offering it rather than discarding
  // merchant-visible state on an absent field.
  if (!question.planId) return null;
  const cached = readAgentPlanCacheRecordShape(thread.cachedPlan);
  // The plan that asked is gone. The dashboard reads its question off this same
  // cache, so its absence means the operator ledger is the last surface still
  // saying an answer is wanted.
  if (!cached) return 'cache_absent';
  if (cached.planId !== question.planId) return 'plan_replaced';
  return null;
}

// Clear only this exact question, so one parked while the turn was loading
// survives. Containment rather than equality: the stored object can carry fields
// this parser drops.
async function resolveStalePendingQuestion(
  organizationId: string,
  memberKey: string,
  question: PendingQuestion,
): Promise<void> {
  const match = JSON.stringify(question.planId
    ? { threadId: question.threadId, planId: question.planId }
    : { threadId: question.threadId, question: question.question });
  await db.$executeRaw`
    UPDATE operator_contexts
    SET pending_question = NULL
    WHERE organization_id = ${organizationId}::uuid AND member_key = ${memberKey}
      AND pending_question @> ${match}::jsonb`;
}

// Drop parked state the merchant can no longer act on: queue entries whose plan
// is terminal or no longer matches the exact current cache, and a question whose
// thread or asking plan is gone. This also removes pre-v7 and identity-less plan
// rows on first use; proactive/system plans survive when their v7 cache identity
// is genuinely current, rather than via a display-origin exception.
//
// Questions used to have no liveness check at all, so one parked for a thread
// that had long since moved on stayed in the ledger the model reads — and,
// because the keyword fast path defers to the model whenever a question is
// pending, changed how an unrelated "yes" was handled.
export async function loadLiveOperatorContext(
  organizationId: string,
  memberKey: string,
  context: OperatorContext,
): Promise<OperatorContext> {
  if (context.pendingPlans.length === 0 && !context.pendingQuestion) return context;

  const live: PendingPlan[] = [];
  for (const plan of context.pendingPlans) {
    const execution = plan.planId
      ? await getPlanExecution(organizationId, plan.planId).catch(() => null)
      : null;
    const terminal = execution && execution.status !== 'pending' && execution.status !== 'claimed';
    const reason = terminal ? null : await pendingPlanStaleReason(organizationId, plan);
    if (terminal || reason) {
      // The merchant may be looking at this card right now, so say what was
      // dropped and why. Silence here is what turned one production incident
      // into a forensic reconstruction against expired logs.
      logger.info({
        organizationId,
        memberKey,
        threadId: plan.threadId,
        planId: plan.planId ?? null,
        reason: terminal ? 'execution_terminal' : reason,
        ...(terminal ? { executionStatus: execution?.status } : {}),
      }, '[Operator] Parked plan dropped before the merchant could act on it');
      await resolveStalePendingPlanContext(organizationId, memberKey, plan).catch(() => undefined);
      continue;
    }
    live.push(plan);
  }

  let pendingQuestion = context.pendingQuestion;
  if (pendingQuestion) {
    const reason = await pendingQuestionStaleReason(organizationId, pendingQuestion);
    if (reason) {
      logger.info({
        organizationId,
        memberKey,
        threadId: pendingQuestion.threadId,
        planId: pendingQuestion.planId ?? null,
        reason,
      }, '[Operator] Parked question dropped before the merchant answered it');
      await resolveStalePendingQuestion(organizationId, memberKey, pendingQuestion).catch(() => undefined);
      pendingQuestion = null;
    }
  }

  if (live.length === context.pendingPlans.length && pendingQuestion === context.pendingQuestion) {
    return context;
  }
  return {
    ...context,
    pendingPlans: live,
    pendingPlan: mostRecentPendingPlan(live),
    pendingQuestion,
  };
}

// Map stored pending-plan tool calls into the RawToolCall shape the approved
// execution path expects.
export function normalizeApprovedToolCalls(toolCalls: ToolCall[]): RawToolCall[] {
  return toolCalls.map(({ id, name, input }) => ({ id, name, input }));
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

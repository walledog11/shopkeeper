import { classifyHomePlan } from '@shopkeeper/agent/plan-preview';
import { getPlanExecution } from '@shopkeeper/agent/execution-ledger';
import { getCurrentPlanForThread, readAgentPlanCacheRecordShape } from '@shopkeeper/agent/plan-cache-shape';
import { PLAN_STEP_LABELS } from '@shopkeeper/agent/tools';
import { SENDER_TYPE } from '@shopkeeper/agent/thread-constants';
import { db } from '@shopkeeper/db';
import { Prisma } from '@prisma/client';
import { parseStoredPendingPlan } from '../operator-context.js';

export const DIGEST_CURSOR_KEY = 'lastSuccessfulDigestAt';
export const WAITING_PLAN_MIN_AGE_MS = 3 * 3_600_000;
export const DEFAULT_HANDLED_LOOKBACK_MS = 24 * 3_600_000;
const NOTABLE_HANDLED_LIMIT = 5;

export interface HandledRollup {
  approvedCount: number;
  autoCount: number;
  replyCount: number;
  refundCount: number;
  notableLines: string[];
}

export interface WaitingItem {
  dedupeKey: string;
  threadId: string;
  line: string;
}

export function resolveHandledWindowStart(
  settings: Record<string, unknown>,
  now: Date,
): Date {
  const cursor = settings[DIGEST_CURSOR_KEY];
  if (typeof cursor === 'string') {
    const parsed = new Date(cursor);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date(now.getTime() - DEFAULT_HANDLED_LOOKBACK_MS);
}

export async function finalizeDigestSend(
  organizationId: string,
  sentAt: Date,
  clearFirstBriefing: boolean,
): Promise<void> {
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { settings: true },
  });
  const raw = (org?.settings as Record<string, unknown> | null) ?? {};
  await db.organization.update({
    where: { id: organizationId },
    data: {
      settings: {
        ...raw,
        [DIGEST_CURSOR_KEY]: sentAt.toISOString(),
        ...(clearFirstBriefing ? { firstBriefingPending: false } : {}),
      } as Prisma.InputJsonObject,
    },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function extractRefundAmount(input: unknown): string | null {
  if (!isRecord(input)) return null;
  const amount = input.amount;
  if (typeof amount === 'number' && Number.isFinite(amount)) {
    return `$${amount % 1 === 0 ? amount.toFixed(0) : amount.toFixed(2)}`;
  }
  return null;
}

function customerFirstName(customerName: string | null | undefined): string | null {
  const trimmed = customerName?.trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/)[0] ?? null;
}

function rawToolCallsToSteps(
  rawToolCalls: Array<{ id: string; name: string; input?: unknown }>,
): Array<{ tool?: string; category: string; label: string }> {
  return rawToolCalls.map((toolCall) => ({
    tool: toolCall.name,
    label: PLAN_STEP_LABELS[toolCall.name] ?? toolCall.name,
    category: toolCall.name.startsWith('get_') || toolCall.name.startsWith('search_') ? 'read' : 'action',
  }));
}

function parkedActionLabel(
  steps: Array<{ tool?: string; category: string; label: string }>,
  customerName: string | null,
): string | undefined {
  const actionableSteps = steps.filter((step) => step.category !== 'read');
  if (actionableSteps.length === 0) return undefined;
  const firstName = customerFirstName(customerName);
  const forCustomer = firstName ? ` for ${firstName}` : '';
  if (actionableSteps.length > 1) {
    return `run those ${actionableSteps.length} steps${forCustomer}`;
  }
  const step = actionableSteps[0]!;
  if (step.tool === 'send_reply') return `reply to ${firstName ?? 'the customer'}`;
  if (step.tool === 'send_email') return `email ${firstName ?? 'the customer'}`;
  return `${step.label.toLowerCase()}${forCustomer}`;
}

function waitingPhrase(
  customerName: string | null,
  rawToolCalls: Array<{ id: string; name: string; input?: unknown }>,
  instruction: string,
  actionLabel?: string,
): string {
  const firstName = customerFirstName(customerName);
  const subject = firstName ? `${firstName}'s` : 'A ticket';
  const refundAmount = extractRefundAmount(
    rawToolCalls.find((toolCall) => toolCall.name === 'create_refund')?.input,
  );
  if (refundAmount) {
    return `${subject} ${refundAmount} refund — still waiting on your OK`;
  }
  if (actionLabel) {
    return `${subject} ${actionLabel} — still waiting on your OK`;
  }
  const parked = parkedActionLabel(rawToolCallsToSteps(rawToolCalls), customerName);
  if (parked) {
    return `${subject} ${parked} — still waiting on your OK`;
  }
  const trimmed = instruction.trim();
  const summary = trimmed.length > 72 ? `${trimmed.slice(0, 72)}…` : trimmed;
  return summary
    ? `${subject} ${summary} — still waiting on your OK`
    : `${subject} — still waiting on your OK`;
}

async function isPlanExecutionResolved(
  organizationId: string,
  planId: string | undefined,
): Promise<boolean> {
  if (!planId) return false;
  const execution = await getPlanExecution(organizationId, planId);
  return execution != null && execution.status !== 'pending' && execution.status !== 'claimed';
}

function describeHandledExecution(execution: {
  mode: string | null;
  thread: { customer: { name: string | null } } | null;
  actions: Array<{ tool: string; input: unknown; status: string }>;
}): string | null {
  const firstName = customerFirstName(execution.thread?.customer?.name ?? null);
  const subject = firstName ?? 'Customer';
  const successfulActions = execution.actions.filter((action) => (
    action.status === 'success' || action.status === 'escalated'
  ));

  const refund = successfulActions.find((action) => action.tool === 'create_refund');
  if (refund) {
    const amount = extractRefundAmount(refund.input);
    return amount ? `Refunded ${subject} ${amount}` : `Refunded ${subject}`;
  }

  if (successfulActions.some((action) => action.tool === 'send_reply' || action.tool === 'send_email')) {
    return `Replied to ${subject}`;
  }

  const primary = successfulActions.find((action) => action.tool !== 'add_internal_note');
  if (!primary) return null;
  const label = PLAN_STEP_LABELS[primary.tool] ?? primary.tool.replace(/_/g, ' ');
  return `${label} for ${subject}`;
}

export async function loadHandledRollup(
  organizationId: string,
  since: Date,
): Promise<HandledRollup> {
  const executions = await db.planExecution.findMany({
    where: {
      organizationId,
      status: 'committed',
      completedAt: { gte: since },
    },
    orderBy: { completedAt: 'desc' },
    include: {
      actions: {
        orderBy: { executedAt: 'asc' },
      },
      thread: {
        select: { customer: { select: { name: true } } },
      },
    },
  });

  let approvedCount = 0;
  let autoCount = 0;
  let replyCount = 0;
  let refundCount = 0;
  const notableLines: string[] = [];

  for (const execution of executions) {
    if (execution.mode === 'auto_executed') autoCount += 1;
    else approvedCount += 1;

    const successfulActions = execution.actions.filter((action) => (
      action.status === 'success' || action.status === 'escalated'
    ));
    if (successfulActions.some((action) => action.tool === 'send_reply' || action.tool === 'send_email')) {
      replyCount += 1;
    }
    if (successfulActions.some((action) => action.tool === 'create_refund')) {
      refundCount += 1;
    }

    if (notableLines.length < NOTABLE_HANDLED_LIMIT) {
      const line = describeHandledExecution(execution);
      if (line) notableLines.push(line);
    }
  }

  return { approvedCount, autoCount, replyCount, refundCount, notableLines };
}

export function formatHandledSection(rollup: HandledRollup): string | null {
  const total = rollup.approvedCount + rollup.autoCount;
  if (total === 0) return null;

  const summaryParts: string[] = [];
  if (rollup.refundCount > 0) {
    summaryParts.push(`${rollup.refundCount} refund${rollup.refundCount === 1 ? '' : 's'}`);
  }
  if (rollup.replyCount > 0) {
    summaryParts.push(`${rollup.replyCount} repl${rollup.replyCount === 1 ? 'y' : 'ies'} sent`);
  }
  if (rollup.autoCount > 0) {
    summaryParts.push(`${rollup.autoCount} auto-handled`);
  }
  if (rollup.approvedCount > 0) {
    summaryParts.push(`${rollup.approvedCount} approved by you`);
  }

  const lines = ['Since your last briefing:', summaryParts.join(' · ')];
  if (rollup.notableLines.length > 0) {
    lines.push(...rollup.notableLines.map((line) => `- ${line}`));
  }
  return lines.join('\n');
}

async function loadOperatorWaitingItems(organizationId: string): Promise<WaitingItem[]> {
  const contexts = await db.operatorContext.findMany({
    where: {
      organizationId,
      OR: [{ pendingPlans: { not: Prisma.DbNull } }, { pendingPlan: { not: Prisma.DbNull } }],
    },
    select: { chatId: true, pendingPlans: true, pendingPlan: true },
  });

  const items: WaitingItem[] = [];
  for (const context of contexts) {
    // Prefer the queue; fall back to the legacy single slot for un-backfilled rows.
    const queued = Array.isArray(context.pendingPlans)
      ? context.pendingPlans
          .map(parseStoredPendingPlan)
          .filter((plan): plan is NonNullable<typeof plan> => plan !== null)
      : [];
    const legacy = queued.length === 0 ? parseStoredPendingPlan(context.pendingPlan) : null;
    const plans = queued.length > 0 ? queued : legacy ? [legacy] : [];

    for (const pendingPlan of plans) {
      if (await isPlanExecutionResolved(organizationId, pendingPlan.planId)) continue;

      const thread = await db.thread.findFirst({
        where: { id: pendingPlan.threadId, organizationId },
        select: { customer: { select: { name: true } } },
      });
      const dedupeKey = pendingPlan.planId
        ?? `${pendingPlan.threadId}:${pendingPlan.planHash ?? ''}:${pendingPlan.instructionHash ?? ''}`;
      items.push({
        dedupeKey,
        threadId: pendingPlan.threadId,
        line: waitingPhrase(
          thread?.customer?.name ?? pendingPlan.customerName ?? null,
          pendingPlan.rawToolCalls,
          pendingPlan.instruction,
          pendingPlan.actionLabel,
        ),
      });
    }
  }
  return items;
}

async function loadStaleThreadWaitingItems(
  organizationId: string,
  now: Date,
  coveredThreadIds: Set<string>,
): Promise<WaitingItem[]> {
  const cutoff = new Date(now.getTime() - WAITING_PLAN_MIN_AGE_MS);
  const threads = await db.thread.findMany({
    where: {
      organizationId,
      status: 'open',
      deletedAt: null,
      cachedPlan: { not: Prisma.DbNull },
      updatedAt: { lte: cutoff },
    },
    select: {
      id: true,
      cachedPlan: true,
      cachedPlanMessageId: true,
      updatedAt: true,
      customer: { select: { name: true } },
      messages: {
        where: { deletedAt: null, senderType: { not: SENDER_TYPE.NOTE } },
        orderBy: [{ sentAt: 'desc' }, { id: 'desc' }],
        take: 1,
        select: { id: true, senderType: true },
      },
    },
  });

  const items: WaitingItem[] = [];
  for (const thread of threads) {
    if (coveredThreadIds.has(thread.id)) continue;

    const cached = readAgentPlanCacheRecordShape(thread.cachedPlan);
    const plan = getCurrentPlanForThread(thread, thread.messages);
    if (!plan || !cached) continue;

    const classification = classifyHomePlan(plan);
    if (classification.kind !== 'needs_review' && classification.kind !== 'needs_merchant_input') {
      continue;
    }
    if (cached.planId && await isPlanExecutionResolved(organizationId, cached.planId)) {
      continue;
    }

    const dedupeKey = cached.planId ?? `thread:${thread.id}:${cached.instruction}`;
    items.push({
      dedupeKey,
      threadId: thread.id,
      line: waitingPhrase(
        thread.customer?.name ?? null,
        plan.rawToolCalls,
        cached.instruction,
      ),
    });
  }
  return items;
}

export async function loadWaitingOnYouItems(
  organizationId: string,
  now: Date,
): Promise<WaitingItem[]> {
  const operatorItems = await loadOperatorWaitingItems(organizationId);
  const seen = new Set<string>();
  const merged: WaitingItem[] = [];

  for (const item of operatorItems) {
    if (seen.has(item.dedupeKey)) continue;
    seen.add(item.dedupeKey);
    merged.push(item);
  }

  const coveredThreads = new Set(operatorItems.map((item) => item.threadId));
  const staleItems = await loadStaleThreadWaitingItems(organizationId, now, coveredThreads);
  for (const item of staleItems) {
    if (seen.has(item.dedupeKey)) continue;
    seen.add(item.dedupeKey);
    merged.push(item);
  }

  return merged;
}

export function formatWaitingSection(items: WaitingItem[]): string | null {
  if (items.length === 0) return null;
  const lines = ['Waiting on you:', ...items.map((item) => `- ${item.line}`)];
  return lines.join('\n');
}

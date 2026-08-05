import { classifyHomePlan } from '@shopkeeper/agent/plan-preview';
import { getPlanExecution } from '@shopkeeper/agent/execution-ledger';
import { getCurrentPlanForThread, readAgentPlanCacheRecordShape } from '@shopkeeper/agent/plan-cache-shape';
import { canonicalInboxThreadWhere } from '@shopkeeper/agent/inbox-filter';
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

const COUNT_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];

/**
 * Spell out small counts of *tickets and queued work* — "three open tickets"
 * reads like a person, "3 open tickets" like a dashboard. The rule is per noun,
 * not per section: the weekly stat line says "five tickets in" too, because the
 * same noun rendered two ways four lines apart is what reads as inconsistent.
 * Money, durations, order counts and window lengths stay in digits; those are
 * numbers the merchant is meant to compare, not sentences.
 */
export function countWord(count: number): string {
  return COUNT_WORDS[count] ?? String(count);
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
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

const WAITING_TOPIC_TRUNC = 72;

// How long the merchant has left this sitting. The header already frames the
// list as waiting on them, so the parenthetical only carries the duration —
// which is the one thing that tells them which of these to open first.
export function formatWaitingAge(now: Date, since: Date | null): string | null {
  if (!since) return null;
  const ms = now.getTime() - since.getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return 'waiting under an hour';
  if (hours < 24) return `waiting ${hours} hour${hours === 1 ? '' : 's'}`;
  const days = Math.floor(hours / 24);
  return `waiting ${days} day${days === 1 ? '' : 's'}`;
}

// What the ticket is actually about. Four bullets that all read "Reply to
// Canary" carry exactly one bit of information — the count — so every line has
// to name its subject, not just the verb. `General` is the classifier's
// catch-all, so it is worth no more than saying nothing.
export function waitingTopic(aiSummary: string | null, tag: string | null): string | null {
  const summary = aiSummary?.trim();
  if (summary) {
    const clipped = summary.length > WAITING_TOPIC_TRUNC
      ? `${summary.slice(0, WAITING_TOPIC_TRUNC)}…`
      : summary;
    // The line closes on a parenthetical, so a summary's own full stop would
    // land mid-sentence.
    return clipped.replace(/\.$/, '');
  }
  const trimmedTag = tag?.trim();
  return trimmedTag && trimmedTag !== 'General' ? trimmedTag : null;
}

// Colon between action and subject, matching the flagged block's `1. Alice:
// summary`. No em-dash anywhere: that is the tell that a machine wrote it.
function waitingLine(action: string, topic: string | null, age: string | null): string {
  const withTopic = topic ? `${action}: ${topic}` : action;
  return age ? `${withTopic} (${age})` : withTopic;
}

// A bare noun phrase for one bullet. The "still waiting on your OK" framing
// lives in the section header, so repeating it per item just pads the text; and
// the action labels already name the customer ("reply to Sarah"), so a
// possessive subject on top of them reads as "Sarah's reply to Sarah".
function waitingPhrase(
  customerName: string | null,
  rawToolCalls: Array<{ id: string; name: string; input?: unknown }>,
  instruction: string,
  actionLabel?: string,
): string {
  const firstName = customerFirstName(customerName);
  const forCustomer = firstName ? ` for ${firstName}` : '';

  const refundAmount = extractRefundAmount(
    rawToolCalls.find((toolCall) => toolCall.name === 'create_refund')?.input,
  );
  if (refundAmount) return `${refundAmount} refund${forCustomer}`;

  const label = actionLabel ?? parkedActionLabel(rawToolCallsToSteps(rawToolCalls), customerName);
  if (label) return label.charAt(0).toUpperCase() + label.slice(1);

  const trimmed = instruction.trim();
  const summary = trimmed.length > 72 ? `${trimmed.slice(0, 72)}…` : trimmed;
  if (!summary) return firstName ? `A ticket${forCustomer}` : 'A ticket';
  return firstName ? `${firstName}: ${summary}` : summary;
}

async function isPlanExecutionResolved(
  organizationId: string,
  planId: string | undefined,
): Promise<boolean> {
  if (!planId) return false;
  const execution = await getPlanExecution(organizationId, planId);
  return execution != null && execution.status !== 'pending' && execution.status !== 'claimed';
}

const IRREGULAR_PAST: Record<string, string> = { set: 'Set', put: 'Put' };

// Plan-step labels are imperative ("Issue refund", "Cancel order"), but this
// section reports what already happened — and the one-item form folds the label
// into a sentence beginning "I …", so the leading verb has to be past tense.
function pastTenseLabel(label: string): string {
  const [verb, ...rest] = label.split(' ');
  if (!verb) return label;
  const lower = verb.toLowerCase();
  const past = IRREGULAR_PAST[lower]
    ?? (lower.endsWith('e')
      ? `${verb}d`
      : /[^aeiou]y$/.test(lower)
        ? `${verb.slice(0, -1)}ied`
        : `${verb}ed`);
  return rest.length > 0 ? `${past} ${rest.join(' ')}` : past;
}

// No name is a reason to drop the subject, not to print one. "Replied to
// Customer" is a placeholder leaking into the merchant's morning text.
function describeHandledExecution(execution: {
  mode: string | null;
  thread: { customer: { name: string | null } } | null;
  actions: Array<{ tool: string; input: unknown; status: string }>;
}): string | null {
  const firstName = customerFirstName(execution.thread?.customer?.name ?? null);
  const successfulActions = execution.actions.filter((action) => (
    action.status === 'success' || action.status === 'escalated'
  ));

  const refund = successfulActions.find((action) => action.tool === 'create_refund');
  if (refund) {
    const amount = extractRefundAmount(refund.input);
    if (firstName) return amount ? `Refunded ${firstName} ${amount}` : `Refunded ${firstName}`;
    return amount ? `Issued a ${amount} refund` : 'Issued a refund';
  }

  if (successfulActions.some((action) => action.tool === 'send_reply' || action.tool === 'send_email')) {
    return firstName ? `Replied to ${firstName}` : 'Sent a reply';
  }

  const primary = successfulActions.find((action) => action.tool !== 'add_internal_note');
  if (!primary) return null;
  const label = pastTenseLabel(PLAN_STEP_LABELS[primary.tool] ?? primary.tool.replace(/_/g, ' '));
  return firstName ? `${label} for ${firstName}` : label;
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

  // One thing does not need a count, a breakdown, and a bullet: "I handled one
  // thing, including one reply: - Replied to Sarah" is the same fact three
  // times. Fold it into the sentence, the way the flagged block already names a
  // lone ticket instead of printing a list of one.
  if (total === 1 && rollup.notableLines.length === 1) {
    const line = rollup.notableLines[0]!;
    const sentence = `Since your last briefing I ${line.charAt(0).toLowerCase()}${line.slice(1)}.`;
    return rollup.autoCount === 1 ? `${sentence}\n\nThat one ran without needing you.` : sentence;
  }

  // "including", not a comma list: an execution that refunded *and* replied is
  // counted by both counters, so the parts do not have to sum to the total.
  const detailParts: string[] = [];
  if (rollup.refundCount > 0) {
    detailParts.push(`${countWord(rollup.refundCount)} refund${rollup.refundCount === 1 ? '' : 's'}`);
  }
  if (rollup.replyCount > 0) {
    detailParts.push(`${countWord(rollup.replyCount)} repl${rollup.replyCount === 1 ? 'y' : 'ies'}`);
  }
  const detail = detailParts.length > 0 ? `, including ${detailParts.join(' and ')}` : '';
  const lead = `Since your last briefing I handled ${countWord(total)} ${total === 1 ? 'thing' : 'things'}${detail}`;

  const lines = [rollup.notableLines.length > 0 ? `${lead}:` : `${lead}.`];
  if (rollup.notableLines.length > 0) {
    lines.push(...rollup.notableLines.map((line) => `- ${line}`));
  }
  // Trust line: say plainly how much of that ran without the merchant. Blank
  // line above it for the same reason the digest's closing ask gets one — a
  // sentence that concludes a block reads as another bullet without the air.
  if (rollup.autoCount > 0) {
    lines.push(``, rollup.autoCount === total
      ? `${total === 1 ? 'That one' : 'Those'} ran without needing you.`
      : `${capitalize(countWord(rollup.autoCount))} of those ran without needing you.`);
  }
  return lines.join('\n');
}

// When the customer last wrote in, which is what "waiting 2 days" means to the
// merchant. Falls back to the thread's own clock when a thread carries no
// inbound message rows.
function waitingSince(thread: {
  updatedAt: Date;
  messages: Array<{ sentAt: Date }>;
} | null): Date | null {
  if (!thread) return null;
  return thread.messages[0]?.sentAt ?? thread.updatedAt;
}

async function loadOperatorWaitingItems(organizationId: string, now: Date): Promise<WaitingItem[]> {
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
        select: {
          updatedAt: true,
          aiSummary: true,
          tag: true,
          customer: { select: { name: true } },
          messages: {
            where: { deletedAt: null, senderType: { not: SENDER_TYPE.NOTE } },
            orderBy: [{ sentAt: 'desc' }, { id: 'desc' }],
            take: 1,
            select: { sentAt: true },
          },
        },
      });
      const dedupeKey = pendingPlan.planId
        ?? `${pendingPlan.threadId}:${pendingPlan.planHash ?? ''}:${pendingPlan.instructionHash ?? ''}`;
      items.push({
        dedupeKey,
        threadId: pendingPlan.threadId,
        line: waitingLine(
          waitingPhrase(
            thread?.customer?.name ?? pendingPlan.customerName ?? null,
            pendingPlan.rawToolCalls,
            pendingPlan.instruction,
            pendingPlan.actionLabel,
          ),
          waitingTopic(thread?.aiSummary ?? null, thread?.tag ?? null),
          formatWaitingAge(now, waitingSince(thread)),
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
      ...canonicalInboxThreadWhere(organizationId),
      status: 'open',
      cachedPlan: { not: Prisma.DbNull },
      updatedAt: { lte: cutoff },
    },
    select: {
      id: true,
      cachedPlan: true,
      cachedPlanMessageId: true,
      updatedAt: true,
      aiSummary: true,
      tag: true,
      customer: { select: { name: true } },
      messages: {
        where: { deletedAt: null, senderType: { not: SENDER_TYPE.NOTE } },
        orderBy: [{ sentAt: 'desc' }, { id: 'desc' }],
        take: 1,
        select: { id: true, senderType: true, sentAt: true },
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
      line: waitingLine(
        waitingPhrase(
          thread.customer?.name ?? null,
          plan.rawToolCalls,
          cached.instruction,
        ),
        waitingTopic(thread.aiSummary, thread.tag),
        formatWaitingAge(now, waitingSince(thread)),
      ),
    });
  }
  return items;
}

export async function loadWaitingOnYouItems(
  organizationId: string,
  now: Date,
): Promise<WaitingItem[]> {
  const operatorItems = await loadOperatorWaitingItems(organizationId, now);
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

  // Operator-parked plans first, in queue order, then the stale-thread ones.
  // Do not re-sort: this list is *numbered* in the message, and the operator
  // ledger numbers `pendingPlans` in the same order, so "the second one" has to
  // mean the same plan on both sides. (`selectPendingPlan` fails closed on an
  // ordinal past the end of the queue, so the stale-thread tail is safe.)
  return merged;
}

export function formatWaitingSection(items: WaitingItem[]): string | null {
  if (items.length === 0) return null;

  if (items.length === 1) {
    return [
      "One thing's still waiting on your OK:",
      `- ${items[0]!.line}`,
      // Its own line with air above it: a sentence that closes a block reads as
      // one more bullet without the gap. Yes/no is safe here — there is exactly
      // one plan for the fast path to land on.
      ``,
      'Want me to go ahead with it?',
    ].join('\n');
  }

  return [
    `${capitalize(countWord(items.length))} things are still waiting on your OK:`,
    // Numbered, so the merchant has a handle to approve one of several — the
    // same affordance the flagged list already gives.
    ...items.map((item, index) => `${index + 1}. ${item.line}`),
    // Deliberately not "want me to send those?" — a bare yes against a list hits
    // the keyword fast path, which approves only the most recent plan. Asking
    // which ones keeps the merchant's one-word answer from meaning something
    // narrower than they intended.
    ``,
    'Tell me which ones to go ahead with.',
  ].join('\n');
}

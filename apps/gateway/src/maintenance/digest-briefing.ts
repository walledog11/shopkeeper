import { getPlanExecution } from '@shopkeeper/agent/execution-ledger';
import { decideAutonomy } from '@shopkeeper/agent/autonomy';
import { getCurrentPlanForThread, readAgentPlanCacheRecordShape } from '@shopkeeper/agent/plan-cache-shape';
import { resolveAgentSettings } from '@shopkeeper/agent/settings';
import { canonicalInboxThreadWhere } from '@shopkeeper/agent/inbox-filter';
import { PLAN_STEP_LABELS } from '@shopkeeper/agent/tools';
import { SENDER_TYPE } from '@shopkeeper/agent/thread-constants';
import { db } from '@shopkeeper/db';
import { Prisma } from '@prisma/client';
import { parseClassifierSignals, type RequestFacts } from '@shopkeeper/agent/classifier-signals';
import { classifyPerson, customerFirstName, personLabel } from '@shopkeeper/agent/person-name';
import { formatFactsBriefingLine, type AskLessContext } from './briefing-fields.js';
import { listVerifiedOrderNamesByThread } from '../storefront-chat-verified-orders.js';
import { parseStoredPendingPlan } from '../operator-context.js';
import {
  formatRequestDisplayLine,
  unavailableRequestDisplay,
  type RequestDisplay,
} from '../message-handlers/request-display.js';

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
  /** Links the briefing ordinal back to its entry in the operator plan queue. */
  planId?: string;
  /** What the briefing orders on. Null when the classifier read no facts. */
  requestFacts: RequestFacts | null;
}

const COUNT_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];

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

export function truncateBriefingText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const slice = text.slice(0, maxLen);
  const lastSpace = slice.lastIndexOf(' ');
  const clipped = lastSpace > maxLen * 0.5 ? slice.slice(0, lastSpace) : slice;
  return `${clipped.replace(/[\s,;:(-]+$/, '')}…`;
}

// An address or link in a briefing line is noise the merchant cannot act on,
// and iMessage renders it as a tappable link mid-sentence.
export function redactBriefingContacts(text: string): string {
  return text
    .replace(/[^\s<>()]+@[^\s<>()]+\.[a-z]{2,}/gi, 'their email')
    .replace(/https?:\/\/\S+/gi, 'a link');
}


// Who the item is about. The order number earns its place in the subject only
// when the topic doesn't already carry it — cutting it out of the topic to
// avoid the repeat is what stranded the punctuation.
//
// `leadsWithAction` means the line already spends a segment on what the agent
// wants to do, so a named customer is subject enough; three segments before the
// topic is more punctuation than information on a phone.
/** What the briefing calls the person on a ticket. */
function briefingPersonName(
  customerName: string | null,
  channelType: string | null,
  verifiedOrders: readonly string[] = [],
  followingText = '',
): string | null {
  return personLabel(classifyPerson({ customerName, channelType, verifiedOrders, followingText }));
}

/**
 * What "yes" actually does.
 *
 * A waiting line built from the subject and the topic alone tells the merchant
 * which ticket this is but not what they are approving, and the closing ask
 * ("Want me to go ahead with it?") gives them nothing else to go on — so the
 * only way to find out what a one-word approval sends is to open the dashboard,
 * which is the opposite of the point. The refund branch below has always led
 * with its action because money is worth reading first; every other action earns
 * the same slot, in the same `action · subject: topic` grammar.
 *
 * `send_reply` and `send_email` are named by hand because their registry
 * plan-step labels ("Notify customer", "Send email to customer") re-state a
 * subject the line already has.
 */
function approvalActionHead(
  rawToolCalls: Array<{ id: string; name: string; input?: unknown }>,
): string | null {
  const actionable = rawToolCalls.filter((toolCall) => (
    !toolCall.name.startsWith('get_') && !toolCall.name.startsWith('search_')
  ));
  const primary = actionable.find((toolCall) => toolCall.name !== 'add_internal_note')
    ?? actionable[0];
  if (!primary) return null;

  // The head opens the line, so it is capitalized even when the fallback had to
  // build it out of a tool name.
  const label = primary.name === 'send_reply'
    ? 'Reply'
    : primary.name === 'send_email'
      ? 'Email'
      : capitalize(PLAN_STEP_LABELS[primary.name] ?? primary.name.replace(/_/g, ' '));
  const rest = actionable.length - 1;
  return rest > 0 ? `${label} + ${countWord(rest)} more` : label;
}

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

export interface BriefingTicketRow {
  aiTitle?: string | null;
  channelType?: string | null;
  customer: { name: string | null };
  /** Text of the newest customer message, for the sections that quote it. */
  pendingMessage?: string | null;
  /** Orders this storefront shopper proved control of. Empty for every other channel. */
  verifiedOrders?: readonly string[];
  /** Raw `Thread.classifierSignals`. Carries `requestFacts` from version 5 on. */
  classifierSignals?: unknown;
}

/** A short customer message is more useful to a human handoff than a paraphrase. */
const HANDOFF_VERBATIM_MAX = 120;
const PHONE_LINE_MAX = 240;

function cleanBriefingText(text: string | null | undefined): string {
  return redactBriefingContacts((text ?? '').replace(/\s+/g, ' ').trim());
}

/**
 * The name a handoff line opens with. Only the person — a handoff prints the
 * request itself next, so a topic label here would say it twice — and the text
 * that follows is passed in so a verified subject does not restate an order that
 * sentence is about to name.
 */
function handoffSubject(thread: BriefingTicketRow, followingText: string): string {
  return briefingPersonName(
    thread.customer?.name ?? null,
    thread.channelType ?? null,
    thread.verifiedOrders ?? [],
    followingText,
  ) ?? 'Someone';
}

/** The classifier version that introduced `requestFacts`. */
const REQUEST_FACTS_MIN_VERSION = 5;

/**
 * The structured fields for a row, when the classifier wrote them. Older rows
 * deliberately render as unavailable rather than reviving model-prose repair.
 *
 * The version check is load-bearing and used not to be: `parseClassifierSignals`
 * fills `requestFacts` with `emptyRequestFacts()` whatever version wrote the
 * row, so this returned empty facts for a version-4 thread rather than null.
 */
export function rowRequestFacts(thread: { classifierSignals?: unknown }): RequestFacts | null {
  const signals = parseClassifierSignals(thread.classifierSignals);
  if (!signals || (signals.version ?? 0) < REQUEST_FACTS_MIN_VERSION) return null;
  return signals.requestFacts;
}

/** The classifier read a greeting or fragment: nothing has been asked yet. */
export function rowHasNoRequest(thread: { classifierSignals?: unknown }): boolean {
  return parseClassifierSignals(thread.classifierSignals)?.intents.no_request === true;
}

/**
 * What a row can still say when no ask was named. `aiTitle` is a bounded topic
 * field from the classifier, not a sentence to re-tense or otherwise repair.
 */
function askLessTopic(aiTitle: string | null | undefined): string | null {
  const title = aiTitle?.trim();
  return title ? redactBriefingContacts(title) : null;
}

export function rowAskLess(thread: BriefingTicketRow): AskLessContext {
  return { noRequest: rowHasNoRequest(thread), topic: askLessTopic(thread.aiTitle) };
}

/**
 * A handoff line from fields. The person is resolved against the order the line
 * is about to print, so a verified subject does not name it twice.
 */
function factsHandoffLine(thread: BriefingTicketRow, now: Date): string | null {
  const facts = rowRequestFacts(thread);
  if (!facts) return null;
  const line = formatFactsBriefingLine(
    facts,
    handoffSubject(thread, facts.order ?? ''),
    now,
    rowAskLess(thread),
  );
  return line ? truncateBriefingText(line, PHONE_LINE_MAX) : null;
}

export function formatBlockedTicketLine(thread: BriefingTicketRow, now: Date = new Date()): string {
  const message = cleanBriefingText(thread.pendingMessage);
  const subject = handoffSubject(thread, message);

  // Short enough to print whole. Covers the one-word case the merchant is meant
  // to judge for themselves: if a bare "yo" ever reaches a handoff, it arrives as
  // "yo" rather than as someone's description of it.
  if (message && message.length <= HANDOFF_VERBATIM_MAX) {
    // Anywhere in the message, not just at the end: "Do these come in olive? The
    // photos look lighter." is a question the merchant has to answer, and it
    // closes on a statement. Saying "wrote" of it is the tell that no one read
    // it. "wrote" is still the fallback, because calling a complaint a question
    // puts words in the customer's mouth.
    return `${subject} ${message.includes('?') ? 'asked' : 'wrote'}: "${message}"`;
  }

  // Fields before any long-message fallback, but after a complete short quote.
  const factsLine = factsHandoffLine(thread, now);
  if (factsLine) return factsLine;

  // The customer text is source material, not model prose. Keep a bounded,
  // contact-redacted quote when structured classification is unavailable.
  if (message) return `${subject} wrote: "${truncateBriefingText(message, PHONE_LINE_MAX)}"`;
  return formatTicketLine(thread);
}

/** Explicit human escalation the agent parked for merchant judgment. */
export function formatEscalatedTicketLine(thread: BriefingTicketRow, now: Date = new Date()): string {
  const factsLine = factsHandoffLine(thread, now);
  if (factsLine) return `${endClause(factsLine)} I flagged it for you.`;
  return `${endClause(formatRequestDisplayLine(unavailableRequestDisplay(), null, now))} I flagged it for you.`;
}

export function formatTicketLine(thread: BriefingTicketRow, now: Date = new Date()): string {
  const facts = rowRequestFacts(thread);
  if (facts) {
    const person = briefingPersonName(
      thread.customer?.name ?? null,
      thread.channelType ?? null,
      thread.verifiedOrders ?? [],
    );
    const line = formatFactsBriefingLine(facts, person, now, rowAskLess(thread));
    if (line) return line;
  }
  return formatRequestDisplayLine(unavailableRequestDisplay(), null, now);
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

/**
 * No name is a reason to drop the subject, not to print one — "Replied to
 * Customer" is a placeholder leaking into the merchant's morning text.
 *
 * Returning null is also the right answer when the only thing left to say is
 * the count. Three unnamed replies rendered as three "Sent a reply" bullets
 * under a lead that already read "including three replies" is the same fact
 * printed twice, the second time as a list that looks broken. Replies and
 * refunds have their own counters, so a bullet earns its place only by naming a
 * customer or an amount; every other tool keeps its label, which the counters
 * never mention.
 */
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
    return amount ? `Issued a ${amount} refund` : null;
  }

  if (successfulActions.some((action) => action.tool === 'send_reply' || action.tool === 'send_email')) {
    return firstName ? `Replied to ${firstName}` : null;
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

    // Two customers can share a first name and two refunds can share an amount;
    // the merchant reads the repeat as a rendering bug either way.
    if (notableLines.length < NOTABLE_HANDLED_LIMIT) {
      const line = describeHandledExecution(execution);
      if (line && !notableLines.includes(line)) notableLines.push(line);
    }
  }

  return { approvedCount, autoCount, replyCount, refundCount, notableLines };
}

export function formatHandledSection(rollup: HandledRollup): string | null {
  const total = rollup.approvedCount + rollup.autoCount;
  if (total === 0) {
    return null;
  }

  // One thing does not need a count, a breakdown, and a bullet: "I handled one
  // thing, including one reply: - Replied to Sarah" is the same fact three
  // times. Fold it into the sentence, the way the flagged block already names a
  // lone ticket instead of printing a list of one.
  if (total === 1 && rollup.notableLines.length <= 1) {
    // With nobody to name, "I handled one thing, including one reply" counts a
    // single event twice; say the event.
    const line = rollup.notableLines[0]
      ?? (rollup.replyCount === 1 ? 'sent one reply' : rollup.refundCount === 1 ? 'issued one refund' : null);
    if (line) {
      const sentence = `Since your last briefing I ${line.charAt(0).toLowerCase()}${line.slice(1)}.`;
      return rollup.autoCount === 1 ? `${sentence}\n\nThat one ran without needing you.` : sentence;
    }
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

async function loadOperatorWaitingItems(
  organizationId: string,
  settings: ReturnType<typeof resolveAgentSettings>,
  now: Date,
): Promise<WaitingItem[]> {
  const contexts = await db.operatorContext.findMany({
    where: {
      organizationId,
      pendingPlans: { not: Prisma.DbNull },
    },
    select: { pendingPlans: true },
  });

  const items: WaitingItem[] = [];
  for (const context of contexts) {
    const plans = (Array.isArray(context.pendingPlans)
      ? context.pendingPlans
          .map(parseStoredPendingPlan)
          .filter((plan): plan is NonNullable<typeof plan> => plan !== null)
      : []);

    for (const pendingPlan of plans) {
      if (await isPlanExecutionResolved(organizationId, pendingPlan.planId)) continue;

      const thread = await db.thread.findFirst({
        where: { id: pendingPlan.threadId, organizationId },
        select: {
          channelType: true,
          filterStatus: true,
          cachedPlan: true,
          cachedPlanMessageId: true,
          customer: { select: { name: true } },
          messages: {
            where: { deletedAt: null, senderType: { not: SENDER_TYPE.NOTE } },
            orderBy: [{ sentAt: 'desc' }, { id: 'desc' }],
            take: 1,
            select: { id: true, senderType: true, sentAt: true },
          },
        },
      });
      if (thread) {
        const currentPlan = getCurrentPlanForThread(thread, thread.messages);
        if (
          currentPlan
          && decideAutonomy(currentPlan, settings, { filterStatus: thread.filterStatus }).kind === 'quick_reply'
        ) {
          continue;
        }
      }
      const dedupeKey = pendingPlan.planId
        ?? `${pendingPlan.threadId}:${pendingPlan.planHash ?? ''}:${pendingPlan.instructionHash ?? ''}`;
      const requestDisplay = pendingPlan.requestDisplay ?? unavailableRequestDisplay();
      const requestFacts = requestDisplay.kind === 'classified' ? requestDisplay.facts : null;
      items.push({
        dedupeKey,
        threadId: pendingPlan.threadId,
        ...(pendingPlan.planId ? { planId: pendingPlan.planId } : {}),
        requestFacts,
        line: formatApprovalItemLine({
          customerName: thread?.customer?.name ?? pendingPlan.customerName ?? null,
          channelType: thread?.channelType ?? null,
          rawToolCalls: pendingPlan.rawToolCalls,
          actionLabel: pendingPlan.actionLabel,
          requestDisplay,
          now,
        }),
      });
    }
  }
  return items;
}

async function loadStaleThreadWaitingItems(
  organizationId: string,
  now: Date,
  coveredThreadIds: Set<string>,
  settings: ReturnType<typeof resolveAgentSettings>,
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
      aiTitle: true,
      classifierSignals: true,
      channelType: true,
      filterStatus: true,
      customer: { select: { name: true } },
      messages: {
        where: { deletedAt: null, senderType: { not: SENDER_TYPE.NOTE } },
        orderBy: [{ sentAt: 'desc' }, { id: 'desc' }],
        take: 1,
        select: { id: true, senderType: true, sentAt: true },
      },
    },
  });

  const verifiedByThread = await listVerifiedOrderNamesByThread(
    organizationId,
    threads.map((thread) => thread.id),
  );

  const items: WaitingItem[] = [];
  for (const thread of threads) {
    if (coveredThreadIds.has(thread.id)) continue;

    const cached = readAgentPlanCacheRecordShape(thread.cachedPlan);
    const plan = getCurrentPlanForThread(thread, thread.messages);
    if (!plan || !cached) continue;

    // Safe replies belong to the autonomous recovery lane, not the merchant's
    // morning. Every other current plan remains an explicit approval or question.
    if (decideAutonomy(plan, settings, { filterStatus: thread.filterStatus }).kind === 'quick_reply') {
      continue;
    }
    if (cached.planId && await isPlanExecutionResolved(organizationId, cached.planId)) {
      continue;
    }

    const dedupeKey = cached.planId ?? `thread:${thread.id}:${cached.instruction}`;
    const requestFacts = rowRequestFacts(thread);
    items.push({
      dedupeKey,
      threadId: thread.id,
      ...(cached.planId ? { planId: cached.planId } : {}),
      requestFacts,
      line: formatApprovalItemLine({
        customerName: thread.customer?.name ?? null,
        channelType: thread.channelType,
        aiTitle: thread.aiTitle,
        rawToolCalls: plan.rawToolCalls,
        verifiedOrders: verifiedByThread.get(thread.id) ?? [],
        requestFacts,
        noRequest: rowHasNoRequest(thread),
        now,
      }),
    });
  }
  return items;
}

export async function loadWaitingOnYouItems(
  organizationId: string,
  now: Date,
): Promise<WaitingItem[]> {
  const organization = await db.organization.findUnique({
    where: { id: organizationId },
    select: { settings: true },
  });
  const settings = resolveAgentSettings(organization?.settings);
  const operatorItems = await loadOperatorWaitingItems(organizationId, settings, now);
  const seen = new Set<string>();
  const merged: WaitingItem[] = [];

  for (const item of operatorItems) {
    if (seen.has(item.dedupeKey)) continue;
    seen.add(item.dedupeKey);
    merged.push(item);
  }

  const coveredThreads = new Set(operatorItems.map((item) => item.threadId));
  const staleItems = await loadStaleThreadWaitingItems(organizationId, now, coveredThreads, settings);
  for (const item of staleItems) {
    if (seen.has(item.dedupeKey)) continue;
    seen.add(item.dedupeKey);
    merged.push(item);
  }

  // Operator-parked plans first, in queue order, then the stale-thread ones.
  // This is a merge order, not a reading order: `buildOrgDigest` sorts these by
  // deadline before they become briefing items. That used to be unsafe, because
  // the briefing numbered its list and the ledger numbered `pendingPlans` in the
  // same order, so "the second one" had to mean the same plan on both sides.
  // Neither still holds — the briefing is prose, and `selectPendingPlan` reads a
  // typed digit off `pendingDigest.items`, which is stored in the order the
  // merchant read rather than the order this queue happens to be in.
  return merged;
}

/**
 * One entry in the single numbered list the briefing prints.
 *
 * The four sections this replaced were named after the agent's own bookkeeping —
 * has a plan / has no plan / plan not stale yet / classifier was unsure — and
 * each got its own heading, its own numbering and its own closing question. A
 * merchant with seven things to do read four lists, two of them starting at "1.",
 * and three different asks. "1 yes" named two different tickets.
 *
 * They are one list now, in one order, because the merchant has one job: get
 * through the things that need them. `kind` survives only to say what a number
 * *does* when it is used, and to group the ones a bare yes can clear.
 */
export interface BriefingItem {
  threadId: string;
  kind: 'approval' | 'decision' | 'flagged';
  planId?: string;
  /** Rendered without its number; the list owns the numbering. */
  line: string;
}


function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/**
 * One sentence per line. On a phone, two sentences sharing a line wrap into a
 * paragraph and the eye has to find where one item ends and the next begins.
 *
 * Never inside a quotation: `Priya asked: "Do these come in olive? The photos
 * look lighter."` is one thing the merchant is being told, and breaking it at
 * the customer's own full stop would read as two separate items. Existing line
 * breaks are left alone — this only ever adds them.
 */
export function oneSentencePerLine(text: string): string {
  let out = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]!;
    out += char;
    if (char === '"') quoted = !quoted;
    if (quoted || !'.!?'.includes(char)) continue;
    // Only break on whitespace that is not already a newline, and never on a
    // decimal point or an initial ("$34.50", "J. Doe").
    const rest = text.slice(i + 1);
    const gap = rest.match(/^[ \t]+/);
    if (!gap || !/^[A-Z"]/.test(rest.slice(gap[0].length))) continue;
    out += '\n';
    i += gap[0].length;
  }
  return out;
}

function endClause(text: string): string {
  return /[.!?…"']$/.test(text) ? text : `${text}.`;
}

/**
 * A sentence, not a data row. `Tomás — $34 refund · Two Cracked Mugs` is a table
 * cell with a name in it; the merchant is reading a text message, and every
 * other line in it is written like one.
 *
 * The summary carries what the customer wanted, so the clause is that plus what
 * a yes would do. Falls back to the compact form only when no summary was
 * written, which is the one case where there is nothing to make a sentence from.
 */
export function formatApprovalItemLine(params: {
  customerName: string | null;
  channelType?: string | null;
  aiTitle?: string | null;
  rawToolCalls: Array<{ id: string; name: string; input?: unknown }>;
  actionLabel?: string;
  verifiedOrders?: readonly string[];
  /** The classifier's structured fields, when the thread has them. */
  requestFacts?: RequestFacts | null;
  /** `intents.no_request` — nothing has been asked yet on this thread. */
  noRequest?: boolean;
  now?: Date;
  /** Immutable snapshot parked with the plan. Preferred for pending approvals. */
  requestDisplay?: RequestDisplay;
}): string {
  const subject = briefingPersonName(
    params.customerName,
    params.channelType ?? null,
    params.verifiedOrders ?? [],
  ) ?? 'Someone';
  const refundAmount = extractRefundAmount(
    params.rawToolCalls.find((toolCall) => toolCall.name === 'create_refund')?.input,
  );
  const action = refundAmount
    ? `${refundAmount} refund`
    : lowerFirst(approvalActionHead(params.rawToolCalls) ?? params.actionLabel ?? 'reply');
  const ready = refundAmount ? `I've got ${refundAmount} ready.` : `${capitalize(action)}'s drafted.`;

  if (params.requestDisplay) {
    return `${endClause(formatRequestDisplayLine(
      params.requestDisplay,
      subject,
      params.now ?? new Date(),
    ))} ${ready}`;
  }

  // The clause states what the customer wanted; `ready` states what a yes does.
  // Fields build the first half when the classifier wrote them, which is what
  // lets a deadline open the line instead of landing past the truncation.
  const factsClause = params.requestFacts
    ? formatFactsBriefingLine(
        params.requestFacts,
        subject,
        params.now ?? new Date(),
        { noRequest: params.noRequest === true, topic: askLessTopic(params.aiTitle) },
      )
    : null;
  if (factsClause) {
    return `${endClause(truncateBriefingText(factsClause, PHONE_LINE_MAX))} ${ready}`;
  }
  return `${endClause(formatRequestDisplayLine(unavailableRequestDisplay(), null, params.now))} ${ready}`;
}

/**
 * How many items still read as a rundown rather than a wall. Past this the
 * briefing stops listing and starts a conversation, the way a person says
 * "there's a fair bit today, want me to take you through it?" instead of
 * reciting fifteen things at someone who has just woken up.
 */
const BRIEFING_RECITE_MAX = 8;

/**
 * The briefing is a text message from someone who works for you, so it is
 * written the way a person writes one: sentences, names, and no numbering.
 *
 * It used to number every item and close by explaining the reply syntax
 * ("Reply with a number: \"1 yes\" sends that one"). Nobody texts a colleague
 * that. The numbers were never for the merchant either — they existed because
 * the ordinal resolver wanted them, which is the machine's problem leaking into
 * the merchant's morning. Replies resolve by name already (`selectPendingPlan`
 * matches a customer name, and the operator turn reads the ledger), so the
 * merchant can just say "refund Tomás" like they would to a person.
 */
function groupLead(kind: BriefingItem['kind'], count: number): string {
  if (kind === 'approval') {
    return count === 1
      ? 'One action is waiting for your approval.'
      : `${capitalize(countWord(count))} actions are waiting for your approval.`;
  }
  if (kind === 'decision') {
    return count === 1 ? 'One needs your decision.' : `${capitalize(countWord(count))} need your decision.`;
  }
  return count === 1 ? 'One sender looks questionable.' : `${capitalize(countWord(count))} senders look questionable.`;
}

const KIND_ORDER: BriefingItem['kind'][] = ['approval', 'decision', 'flagged'];

export function formatNeedsYouProse(items: BriefingItem[]): string | null {
  if (items.length === 0) return null;

  // Too many to recite. Lead with the two that matter and offer the rest, rather
  // than making them scroll through fifteen before they can act on one.
  if (items.length > BRIEFING_RECITE_MAX) {
    const top = items.slice(0, 2).map((item) => item.line);
    return [
      `Busy one. ${capitalize(countWord(items.length))} things need you today.`,
      '',
      top.length === 1 ? 'The one worth doing first:' : 'The two worth doing first:',
      '',
      top.map(oneSentencePerLine).join('\n\n'),
      '',
      'Want me to take you through the rest?',
    ].join('\n');
  }

  const blocks: string[] = [];
  for (const kind of KIND_ORDER) {
    const group = items.filter((item) => item.kind === kind);
    if (group.length === 0) continue;
    if (blocks.length > 0) blocks.push('');
    blocks.push(groupLead(kind, group.length), '');
    // A blank line between items, none inside one. Sentences belonging to the
    // same ticket stay together and the gap is what says "next person" — without
    // it, "I've got $34 ready." and the next customer's name are consecutive
    // lines with nothing to separate them.
    blocks.push(group.map((item) => oneSentencePerLine(item.line)).join('\n\n'));
  }
  return blocks.join('\n');
}

/**
 * A close, not an instruction. The merchant answers a text the way they answer
 * any text; the agent's job is to understand it, not to teach a grammar for it.
 */
export function formatNeedsYouAsk(items: BriefingItem[]): string | null {
  if (items.length === 0 || items.length > BRIEFING_RECITE_MAX) return null;
  const readyOnly = items.every((item) => item.kind === 'approval');
  if (readyOnly) {
    return 'Should I go ahead?';
  }
  return items.length === 1 ? 'What do you want to do?' : 'Tell me what you want to do with these.';
}

import { getPlanExecution } from '@shopkeeper/agent/execution-ledger';
import type { HomePlanKind } from '@shopkeeper/agent/plan-preview';
import { getCurrentPlanForThread, readAgentPlanCacheRecordShape } from '@shopkeeper/agent/plan-cache-shape';
import { canonicalInboxThreadWhere } from '@shopkeeper/agent/inbox-filter';
import { PLAN_STEP_LABELS } from '@shopkeeper/agent/tools';
import { SENDER_TYPE, THREAD_STATUS } from '@shopkeeper/agent/thread-constants';
import { db } from '@shopkeeper/db';
import { Prisma } from '@prisma/client';
import { CHANNEL } from '../constants.js';
import { parseStoredPendingPlan } from '../operator-context.js';

export const DIGEST_CURSOR_KEY = 'lastSuccessfulDigestAt';
export const WAITING_PLAN_MIN_AGE_MS = 3 * 3_600_000;
export const DEFAULT_HANDLED_LOOKBACK_MS = 24 * 3_600_000;
const NOTABLE_HANDLED_LIMIT = 5;
const DIGEST_OTHER_OPEN_LIMIT = 2;

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

/**
 * What an open thread is actually waiting on. The briefing could report two
 * states — plan ready and nothing to report — while a thread sits in one of
 * these five, which is why threads with no plan ended up in an "Also open"
 * roll-up under a "want me to go ahead?" that did not cover them.
 *
 * Every state is derived from rows that already exist. Nothing is stored.
 */
export type ThreadLifecycleState =
  | 'awaiting_approval'
  | 'awaiting_customer'
  | 'blocked_no_plan'
  | 'empty_thread'
  | 'handled';

export function deriveThreadLifecycleState(thread: {
  status: string;
  /**
   * `classifyHomePlan(getCurrentPlanForThread(...)).kind`, or null when there is
   * no current plan. Every kind collapses to `awaiting_approval` — a plan the
   * executor did not run is waiting on the merchant whatever shape it is. That
   * includes `auto_execute`, which stays cached and unexecuted under
   * `autoExecuteMode` off and shadow. Same reasoning as the stale-scan filter.
   */
  planKind: HomePlanKind | null;
  /** A plan parked for this thread in the operator's approval ledger. */
  parkedPlan: boolean;
  /**
   * `senderType` of the newest non-`note` message, or null when the thread has
   * none. Notes are not conversational — the two Order Status threads that read
   * as empty each hold two of them, written by the Shopify order webhook — so a
   * note must never count as the agent having answered.
   */
  lastConversationalSender: string | null;
}): ThreadLifecycleState {
  if (thread.status === THREAD_STATUS.CLOSED) return 'handled';

  // Ahead of the transcript checks: a parked plan is a decision the merchant
  // owes regardless of what the messages look like.
  if (thread.planKind !== null || thread.parkedPlan) return 'awaiting_approval';

  if (thread.lastConversationalSender === null) return 'empty_thread';

  // Negative rather than an `agent`/`ai` allow-list: only a customer having the
  // last word means the thread is blocked on us, so an unrecognized sender type
  // reads as answered rather than as a handoff the merchant has to pick up.
  if (thread.lastConversationalSender !== SENDER_TYPE.CUSTOMER) return 'awaiting_customer';

  return 'blocked_no_plan';
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

// One iMessage line of context. The classifier already writes `aiTitle` at 3-to-6
// words, so this cap is a backstop for the summary fallback, not the usual path.
const BRIEFING_TOPIC_MAX = 60;

const BRIEFING_TAG_LABELS: Record<string, string> = {
  'Order Status': "where's my order?",
  Shipping: 'shipping question',
  Refund: 'refund request',
};

function briefingTagLabel(tag: string): string {
  return BRIEFING_TAG_LABELS[tag] ?? tag;
}

function briefingSubjectName(customerName: string | null): string | null {
  const firstName = customerFirstName(customerName);
  if (!firstName || firstName.toLowerCase() === 'customer') return null;
  return firstName;
}

// Nobody on storefront chat has identified themselves, so there is no name to
// print — but "Someone" twice in one list says less than the channel does.
const VISITOR_SUBJECT = 'Storefront visitor';

export function truncateBriefingText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const slice = text.slice(0, maxLen);
  const lastSpace = slice.lastIndexOf(' ');
  const clipped = lastSpace > maxLen * 0.5 ? slice.slice(0, lastSpace) : slice;
  return `${clipped.replace(/[\s,;:(-]+$/, '')}…`;
}

function extractOrderRef(text: string): string | null {
  const orderMatch = text.match(/\border\s*(#?\d{3,})\b/i);
  if (orderMatch) {
    const raw = orderMatch[1];
    return raw.startsWith('#') ? raw : `#${raw}`;
  }
  const hashMatch = text.match(/(#\d{3,})/);
  return hashMatch ? hashMatch[1] : null;
}

// An address or link in a briefing line is noise the merchant cannot act on,
// and iMessage renders it as a tappable link mid-sentence.
export function redactBriefingContacts(text: string): string {
  return text
    .replace(/[^\s<>()]+@[^\s<>()]+\.[a-z]{2,}/gi, 'their email')
    .replace(/https?:\/\/\S+/gi, 'a link');
}

// Removing anything from mid-sentence strands the punctuation that framed it:
// "for four orders (#1019, #1020)" became "for four orders (,".
function tidyPunctuation(text: string): string {
  return text
    .replace(/\(\s*[,;]\s*/g, '(')
    .replace(/\(\s*\)/g, '')
    .replace(/\s+([,;.!?])/g, '$1')
    .replace(/([,;])(?:\s*[,;])+/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .replace(/[\s,;:(-]+$/, '')
    .trim();
}

// One structural rule, not a list of remembered phrasings: drop the
// "Customer <verb>" opener the classifier is prompted to write. Per-ticket
// rewrites used to live here (", stated twice" → ", repeated"; "and mentions an
// upcoming trip" → ", trip soon"). Each was fitted to one morning's summaries
// and left the next morning's to fall through raw.
const SUMMARY_PREAMBLE =
  /^(?:the\s+)?(?:customer|visitor|shopper|sender|someone)\s+(?:states?|reports?|writes?|wrote|sent|says?|said|is\s+asking|asks?|asked|requests?|requested|wants?|mentions?|notes?|claims?|provides?|provided)\s+(?:that\s+|for\s+|about\s+|whether\s+|if\s+)?/i;

// The classifier's own tic for a fragmentary message, straight from its prompt.
const SINGLE_WORD_PREAMBLE = /^a\s+single\s+word:\s*/i;

function topicFromSummary(summary: string): string {
  const withoutPreamble = summary
    .trim()
    .replace(SUMMARY_PREAMBLE, '')
    .replace(SINGLE_WORD_PREAMBLE, '')
    // The article belonged to the verb that was just removed.
    .replace(/^(?:an?|the)\s+/i, '');
  const firstSentence = withoutPreamble.split(/(?<=[.!?])\s+/)[0] ?? withoutPreamble;
  return firstSentence
    .replace(/^["'](.+)["']$/, '$1')
    .replace(/\.$/, '');
}

/**
 * The one line of context a briefing item gets. `aiTitle` is the classifier's
 * own 3-to-6-word subject line naming the topic — which is exactly the unit a
 * phone briefing needs. `aiSummary` is the dashboard's full third-person
 * sentence, capped at 1,000 characters; squeezing that down to a phone line is
 * what produced the mid-sentence truncations.
 */
export function briefingTopic(
  aiTitle: string | null,
  aiSummary: string | null,
  tag: string | null,
): string | null {
  const title = aiTitle?.trim();
  const summary = aiSummary?.trim();
  const base = title || (summary ? topicFromSummary(summary) : '');
  const cleaned = tidyPunctuation(redactBriefingContacts(base));
  if (cleaned) return truncateBriefingText(capitalize(cleaned), BRIEFING_TOPIC_MAX);

  const trimmedTag = tag?.trim();
  if (!trimmedTag || trimmedTag === 'General') return null;
  return capitalize(briefingTagLabel(trimmedTag));
}

// Who the item is about. The order number earns its place in the subject only
// when the topic doesn't already carry it — cutting it out of the topic to
// avoid the repeat is what stranded the punctuation.
//
// `leadsWithAction` means the line already spends a segment on what the agent
// wants to do, so a named customer is subject enough; three segments before the
// topic is more punctuation than information on a phone.
function briefingSubject(
  customerName: string | null,
  channelType: string | null,
  orderRef: string | null,
  topic: string | null,
  leadsWithAction = false,
): string {
  const name = briefingSubjectName(customerName)
    ?? (channelType === CHANNEL.SHOPIFY_CHAT ? VISITOR_SUBJECT : null);
  const alreadyInTopic = orderRef != null
    && (topic ?? '').includes(orderRef.replace('#', ''));
  const ref = orderRef && !alreadyInTopic && !(name && leadsWithAction) ? orderRef : null;
  if (name && ref) return `${name} · ${ref}`;
  return ref ?? name ?? 'Someone';
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
 * `send_reply` and `send_email` are named by hand for the same reason
 * `parkedActionLabel` names them: their registry plan-step labels ("Notify
 * customer", "Send email to customer") re-state a subject the line already has.
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
  const summary = truncateBriefingText(trimmed, BRIEFING_TOPIC_MAX);
  if (!summary) return firstName ? `A ticket${forCustomer}` : 'A ticket';
  return firstName ? `${firstName}: ${summary}` : summary;
}

export function formatWaitingItemLine(params: {
  customerName: string | null;
  channelType?: string | null;
  aiTitle?: string | null;
  aiSummary: string | null;
  tag: string | null;
  rawToolCalls: Array<{ id: string; name: string; input?: unknown }>;
  instruction: string;
  actionLabel?: string;
  now: Date;
  since: Date | null;
}): string {
  const {
    customerName,
    channelType,
    aiTitle,
    aiSummary,
    tag,
    rawToolCalls,
    instruction,
    actionLabel,
    now,
    since,
  } = params;
  const age = formatWaitingAge(now, since);
  const agePart = age ? ` (${age})` : '';
  const topic = briefingTopic(aiTitle ?? null, aiSummary, tag);
  const orderRef = extractOrderRef(`${aiTitle ?? ''} ${aiSummary ?? ''}`);

  // Money leads: an amount is the one thing worth reading before the name.
  const refundAmount = extractRefundAmount(
    rawToolCalls.find((toolCall) => toolCall.name === 'create_refund')?.input,
  );
  if (refundAmount) {
    const subjectName = briefingSubjectName(customerName);
    const head = subjectName ? `${refundAmount} refund · ${subjectName}` : `${refundAmount} refund`;
    return topic ? `${head}: ${topic}${agePart}` : `${head}${agePart}`;
  }

  // The subject slot is still for a person or an order, never a tool label: a
  // line reading "Escalate to merchant: about tracking numbers" has spent its
  // most scannable position on a word the section header already said. The
  // action gets its own leading segment instead, ahead of the subject.
  if (topic) {
    const action = approvalActionHead(rawToolCalls);
    const subject = briefingSubject(
      customerName,
      channelType ?? null,
      orderRef,
      topic,
      action != null,
    );
    const head = action ? `${action} · ${subject}` : subject;
    return `${head}: ${topic}${agePart}`;
  }

  // Nothing describes the ticket, so the parked action is the only information
  // there is.
  return waitingLine(
    waitingPhrase(customerName, rawToolCalls, instruction, actionLabel),
    null,
    age,
  );
}

// Compact one-line label for open tickets the merchant hasn't already seen above.
export function formatBriefingTicketLine(
  customerName: string | null,
  aiTitle: string | null,
  aiSummary: string | null,
  tag: string | null,
  channelType?: string | null,
): string {
  const topic = briefingTopic(aiTitle, aiSummary, tag);
  const orderRef = extractOrderRef(`${aiTitle ?? ''} ${aiSummary ?? ''}`);
  const subject = briefingSubject(customerName, channelType ?? null, orderRef, topic);
  if (topic) return `${subject}: ${topic}`;
  return subject === 'Someone' ? 'Open ticket' : subject;
}

export interface BriefingTicketRow {
  aiTitle?: string | null;
  aiSummary: string | null;
  tag: string | null;
  channelType?: string | null;
  customer: { name: string | null };
  /** Text of the newest customer message, for the sections that quote it. */
  pendingMessage?: string | null;
}

/**
 * A handoff line has to carry everything the merchant needs to answer, because
 * anything missing costs a round trip: they ask what the message said, the agent
 * explains, and only then can they act. Two failures to avoid, and they pull in
 * opposite directions.
 *
 * The classifier's `title` is a topic label written for scanning ("Olive Linen
 * Napkins", "Unclear One Word Message"). It never states the request, so it is
 * not used here at all.
 *
 * A verbatim quote states the request exactly, but only while it fits. Cut at a
 * fixed width it becomes the same dead end from the other side: "…the photos look
 * lighter than the" tells the merchant a sentence existed.
 *
 * So: quote the customer whenever the whole message fits, since exact words beat
 * any paraphrase and a short message is the case where nothing is lost. Past that
 * width, use `aiSummary`, which is a complete one-sentence statement of the
 * request rather than a fragment of one. Nothing is elided in either branch.
 */
const HANDOFF_VERBATIM_MAX = 120;
const HANDOFF_SUMMARY_MAX = 240;

function cleanBriefingText(text: string | null | undefined): string {
  return redactBriefingContacts((text ?? '').replace(/\s+/g, ' ').trim());
}

function handoffBody(thread: BriefingTicketRow): string | null {
  const message = cleanBriefingText(thread.pendingMessage);

  // Short enough to print whole. Covers the one-word case the merchant is meant
  // to judge for themselves: if a bare "yo" ever reaches a handoff, it arrives as
  // "yo" rather than as someone's description of it.
  if (message && message.length <= HANDOFF_VERBATIM_MAX) return `"${message}"`;

  const summary = cleanBriefingText(thread.aiSummary);
  if (summary) return truncateBriefingText(summary, HANDOFF_SUMMARY_MAX);

  // Long message, no summary — the one branch that can still elide. Cut at the
  // summary budget rather than the quote budget so the most possible survives.
  return message ? `"${truncateBriefingText(message, HANDOFF_SUMMARY_MAX)}"` : null;
}

function formatBlockedTicketLine(thread: BriefingTicketRow): string {
  const body = handoffBody(thread);
  if (!body) return formatTicketLine(thread);

  // Subject only: pass no title, summary or tag so the slot after the colon
  // carries the request itself rather than a label for it as well.
  const subject = formatBriefingTicketLine(
    thread.customer?.name ?? null,
    null,
    null,
    null,
    thread.channelType ?? null,
  );
  return `${subject === 'Open ticket' ? 'Someone' : subject}: ${body}`;
}

function formatTicketLine(thread: BriefingTicketRow): string {
  return formatBriefingTicketLine(
    thread.customer?.name ?? null,
    thread.aiTitle ?? null,
    thread.aiSummary,
    thread.tag,
    thread.channelType ?? null,
  );
}

function formatTicketRollup(
  header: string,
  threads: BriefingTicketRow[],
  lineFor: (thread: BriefingTicketRow) => string = formatTicketLine,
): string | null {
  if (threads.length === 0) return null;

  const lines = [header];
  const shown = threads.slice(0, DIGEST_OTHER_OPEN_LIMIT);
  for (const thread of shown) {
    lines.push(`- ${lineFor(thread)}`);
  }
  const remaining = threads.length - shown.length;
  if (remaining > 0) {
    lines.push(`…and ${countWord(remaining)} more`);
  }
  return lines.join('\n');
}

/**
 * `blocked_no_plan`: a customer is waiting, the agent has no plan, and nothing
 * in the product will make one. Said as a handoff naming what the agent could
 * not do, because the alternative — listing it under "Also open" beneath an
 * approval ask — reads as something already in hand.
 *
 * This is the section the model-elected `escalate_to_human` path cannot cover:
 * escalation happens during a run, and these threads never got one.
 */
export function formatBlockedSection(threads: BriefingTicketRow[]): string | null {
  return formatTicketRollup(
    threads.length === 1
      ? "One I couldn't work out a next step on, so it's yours:"
      : `${capitalize(countWord(threads.length))} I couldn't work out a next step on, so they're yours:`,
    threads,
    formatBlockedTicketLine,
  );
}

/** `awaiting_customer`: reported, never asked. The merchant has no decision here. */
export function formatAwaitingCustomerSection(threads: BriefingTicketRow[]): string | null {
  return formatTicketRollup(
    threads.length === 1
      ? "I answered this one and haven't heard back:"
      : `I answered ${countWord(threads.length)} of these and haven't heard back:`,
    threads,
  );
}

export function formatOtherOpenSection(
  threads: BriefingTicketRow[],
): string | null {
  return formatTicketRollup('Also open:', threads);
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

export function formatHandledSection(rollup: HandledRollup): string {
  const total = rollup.approvedCount + rollup.autoCount;
  if (total === 0) {
    return 'Since your last briefing I didn\'t send any replies or refunds.';
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
          updatedAt: true,
          aiTitle: true,
          aiSummary: true,
          tag: true,
          channelType: true,
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
        line: formatWaitingItemLine({
          customerName: thread?.customer?.name ?? pendingPlan.customerName ?? null,
          channelType: thread?.channelType ?? null,
          aiTitle: thread?.aiTitle ?? null,
          aiSummary: thread?.aiSummary ?? null,
          tag: thread?.tag ?? null,
          rawToolCalls: pendingPlan.rawToolCalls,
          instruction: pendingPlan.instruction,
          actionLabel: pendingPlan.actionLabel,
          now,
          since: waitingSince(thread),
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
      aiSummary: true,
      tag: true,
      channelType: true,
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

    // No classification filter. A plan still cached this long after its thread
    // last moved was not executed, whatever shape it is, so it is waiting on the
    // merchant by definition. Filtering to needs_review/needs_merchant_input
    // stranded exactly the plans the operator queue drops: `appendPendingPlan`
    // keeps only the newest, so a second ticket evicts a `quick_reply` from the
    // phone's approval slot and this scan then refused to bring it back.
    if (cached.planId && await isPlanExecutionResolved(organizationId, cached.planId)) {
      continue;
    }

    const dedupeKey = cached.planId ?? `thread:${thread.id}:${cached.instruction}`;
    items.push({
      dedupeKey,
      threadId: thread.id,
      line: formatWaitingItemLine({
        customerName: thread.customer?.name ?? null,
        channelType: thread.channelType,
        aiTitle: thread.aiTitle,
        aiSummary: thread.aiSummary,
        tag: thread.tag,
        rawToolCalls: plan.rawToolCalls,
        instruction: cached.instruction,
        now,
        since: waitingSince(thread),
      }),
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

export function formatWaitingList(items: WaitingItem[]): string | null {
  if (items.length === 0) return null;

  if (items.length === 1) {
    return [
      "One thing's still waiting on your OK:",
      `- ${items[0]!.line}`,
    ].join('\n');
  }

  // Blank lines between the items, not just around the block. Each of these
  // wraps to two or three lines on a phone, so consecutive lines run the end of
  // one approval into the start of the next and the list reads as a paragraph.
  return [
    `${capitalize(countWord(items.length))} things are still waiting on your OK:`,
    '',
    items.map((item, index) => `${index + 1}. ${item.line}`).join('\n\n'),
  ].join('\n');
}

/**
 * The ask lands last, after the blocked, awaiting-customer, also-open, flagged
 * and stat sections, so it cannot use a bare pronoun: "Want me to go ahead with
 * it?" under a message listing five tickets asked about all five while covering
 * only the approval list. It names its own section instead, matching the header
 * `formatWaitingList` writes, so the scope is readable from the ask alone.
 */
export function formatWaitingAsk(items: WaitingItem[]): string | null {
  if (items.length === 0) return null;
  return items.length === 1
    ? 'Want me to go ahead with the one waiting on your OK?'
    : `Tell me which of the ${countWord(items.length)} waiting on your OK to go ahead with.`;
}

export function formatWaitingSection(items: WaitingItem[]): string | null {
  const list = formatWaitingList(items);
  const ask = formatWaitingAsk(items);
  if (!list || !ask) return null;
  return `${list}\n\n${ask}`;
}

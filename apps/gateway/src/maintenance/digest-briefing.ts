import { getPlanExecution } from '@shopkeeper/agent/execution-ledger';
import { classifyHomePlan } from '@shopkeeper/agent/plan-preview';
import { getCurrentPlanForThread, readAgentPlanCacheRecordShape } from '@shopkeeper/agent/plan-cache-shape';
import { resolveAgentSettings } from '@shopkeeper/agent/settings';
import { canonicalInboxThreadWhere } from '@shopkeeper/agent/inbox-filter';
import { PLAN_STEP_LABELS } from '@shopkeeper/agent/tools';
import { SENDER_TYPE } from '@shopkeeper/agent/thread-constants';
import { db } from '@shopkeeper/db';
import { Prisma } from '@prisma/client';
import { CHANNEL } from '../constants.js';
import { listVerifiedOrderNamesByThread } from '../storefront-chat-verified-orders.js';
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
  /** Links the briefing ordinal back to its entry in the operator plan queue. */
  planId?: string;
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

function customerFirstName(customerName: string | null | undefined): string | null {
  const trimmed = customerName?.trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/)[0] ?? null;
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

/**
 * The same opener as SUMMARY_PREAMBLE, but capturing, so a full sentence can be
 * rebuilt around the person instead of the opener being deleted.
 *
 * `aiSummary` is written third-person present for a dashboard field — "Customer
 * asks to move order #1043 to a new flat". Printed under a name on a phone it
 * reads like a system record of a person rather than a colleague telling you
 * what happened: the noun repeats what the line already said, and the present
 * tense narrates something that happened hours ago as though it were happening
 * now.
 */
const REPORTED_SPEECH =
  /^(?:the\s+)?(?:customer|visitor|shopper|sender|someone)\s+(states?|reports?|writes?|wrote|sent|says?|said|is\s+asking|asks?|asked|requests?|requested|wants?|mentions?|notes?|claims?|provides?|provided)\s+(that\s+|for\s+|about\s+|whether\s+|if\s+)?/i;

// Closed set, because it is exactly the verbs the classifier prompt offers. A
// general past-tense rule would be guessing at words that never arrive.
const REPORTED_VERB_PAST: Record<string, string> = {
  state: 'said', states: 'said',
  report: 'reported', reports: 'reported',
  write: 'wrote', writes: 'wrote', wrote: 'wrote',
  sent: 'sent',
  say: 'said', says: 'said', said: 'said',
  'is asking': 'asked', ask: 'asked', asks: 'asked', asked: 'asked',
  // Backshifted to its own past tense, not to "asked". "request" takes a bare
  // object and "ask" takes one only with `for`, so mapping across the two verbs
  // dropped the preposition: "and requests a refund" came out of the briefing as
  // "and asked a refund".
  request: 'requested', requests: 'requested', requested: 'requested',
  want: 'wanted', wants: 'wanted',
  mention: 'mentioned', mentions: 'mentioned',
  note: 'noted', notes: 'noted',
  claim: 'claimed', claims: 'claimed',
  provide: 'gave', provides: 'gave', provided: 'gave',
};

/**
 * "Customer asks to move order #1043 to a new flat" plus "Dana" becomes "Dana
 * asked to move order #1043 to a new flat". Null when the summary does not open
 * in reported speech, which leaves the caller on its own `Name: blurb` shape
 * rather than inventing a sentence around prose that was not one.
 *
 * Only the opener is rewritten. Rewording the body is the classifier's job, and
 * per-phrase fixes here have already been tried and deleted once: each was
 * fitted to one morning's summaries and left the next morning's raw.
 */
export function humanizeReportedSummary(subject: string, summary: string): string | null {
  const match = summary.trim().match(REPORTED_SPEECH);
  if (!match) return null;

  const verb = REPORTED_VERB_PAST[match[1]!.toLowerCase().replace(/\s+/g, ' ')];
  const rest = summary.trim().slice(match[0].length).trim();
  if (!verb || !rest) return null;

  // A summary often runs two verbs off one subject ("reports … and asks …").
  // Backshifting only the first leaves "Tomás reported … and asks …", which is
  // the kind of seam that makes a sentence read as generated.
  const tail = rest.replace(
    /\b(and|then|but)\s+(states?|reports?|writes?|says?|is\s+asking|asks?|requests?|wants?|mentions?|notes?|claims?|provides?)\b/gi,
    (_whole, conjunction: string, following: string) => {
      const past = REPORTED_VERB_PAST[following.toLowerCase().replace(/\s+/g, ' ')];
      return past ? `${conjunction} ${past}` : `${conjunction} ${following}`;
    },
  );
  return `${subject} ${verb} ${match[2]?.toLowerCase() ?? ''}${tail}`;
}

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
  maxLen: number = BRIEFING_TOPIC_MAX,
): string | null {
  const title = aiTitle?.trim();
  const summary = aiSummary?.trim();
  const base = title || (summary ? topicFromSummary(summary) : '');
  const cleaned = tidyPunctuation(redactBriefingContacts(base));
  if (cleaned) return truncateBriefingText(capitalize(cleaned), maxLen);

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
/**
 * The one place the briefing decides what to call the person on a ticket. Null
 * means nobody has been identified and the caller supplies its own fallback —
 * `briefingSubject` can fall back to an order reference, the approval line
 * cannot.
 *
 * Someone who entered a code mailed to the address on an order has proved they
 * are the customer on it, and that is the word a merchant reading their phone
 * would use. "Storefront visitor" is honest only while nobody has identified
 * them; kept past that it states the opposite of what happened, and it
 * contradicts the two surfaces that already read verification — the operator
 * card ("They confirmed the email on #1024") and the classifier, which is told
 * to call this same person "the shopper". Naming the order keeps the claim
 * scoped the way verification is: to that order, never to an account.
 */
function briefingPersonName(
  customerName: string | null,
  channelType: string | null,
  verifiedOrders: readonly string[] = [],
  // The text this subject introduces, when the caller has it. An order named
  // here as well as in the subject prints the same order twice in one sentence —
  // "The customer on #1024 requested a refund … on order #1024" — and the
  // sentence is the better place for it.
  followingText = '',
): string | null {
  const named = briefingSubjectName(customerName);
  if (named) return named;
  if (channelType !== CHANNEL.SHOPIFY_CHAT) return null;
  if (verifiedOrders.length === 0) return VISITOR_SUBJECT;
  const unnamed = verifiedOrders.filter((order) => !followingText.includes(order.replace('#', '')));
  return unnamed.length > 0 ? `The customer on ${unnamed.join(', ')}` : 'The customer';
}

function briefingSubject(
  customerName: string | null,
  channelType: string | null,
  orderRef: string | null,
  topic: string | null,
  leadsWithAction = false,
  verifiedOrders: readonly string[] = [],
): string {
  const name = briefingPersonName(customerName, channelType, verifiedOrders);
  // The verified form already names the order, so the ` · #1024` suffix would
  // print it twice.
  const alreadyNamed = orderRef != null
    && ((topic ?? '').includes(orderRef.replace('#', '')) || (name?.includes(orderRef) ?? false));
  const ref = orderRef && !alreadyNamed && !(name && leadsWithAction) ? orderRef : null;
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

// Compact one-line label for open tickets the merchant hasn't already seen above.
export function formatBriefingTicketLine(
  customerName: string | null,
  aiTitle: string | null,
  aiSummary: string | null,
  tag: string | null,
  channelType?: string | null,
  verifiedOrders: readonly string[] = [],
): string {
  const topic = briefingTopic(aiTitle, aiSummary, tag);
  const orderRef = extractOrderRef(`${aiTitle ?? ''} ${aiSummary ?? ''}`);
  const subject = briefingSubject(customerName, channelType ?? null, orderRef, topic, false, verifiedOrders);
  if (topic) return `${subject}: ${topic}`;
  return subject === 'Someone' ? 'Open ticket' : subject;
}

export interface BriefingTicketRow {
  aiTitle?: string | null;
  aiSummary: string | null;
  /** The newest unanswered ask. Preferred over `aiSummary` — see `briefingSummarySource`. */
  requestSummary?: string | null;
  tag: string | null;
  channelType?: string | null;
  customer: { name: string | null };
  /** Text of the newest customer message, for the sections that quote it. */
  pendingMessage?: string | null;
  /** Orders this storefront shopper proved control of. Empty for every other channel. */
  verifiedOrders?: readonly string[];
}

/**
 * Which summary a briefing line is built from.
 *
 * `requestSummary` is the newest unanswered ask. `aiSummary` is the episode
 * summary — everything said in the conversation so far, true however the
 * conversation moved on. Every other operator surface reads the first:
 * `generateThreadPlan` takes `requestSummary` as its instruction, and the plan
 * and question cards render it. The briefing was the last place still reading
 * the second, which is how one escalation reached a merchant's phone as a refund
 * request *and* a shipping question *and* a pricing question *and* a privacy
 * question — four asks from across the conversation, printed as though they had
 * arrived together, above a plan that only ever addressed the refund.
 *
 * `aiSummary` stays as the fallback: proactive plans (delivery exception, return
 * arrival) have no inbound message to summarise and leave `requestSummary` null
 * by construction, and threads classified before the field existed have none.
 */
export function briefingSummarySource(thread: BriefingTicketRow): string | null {
  return thread.requestSummary?.trim() || thread.aiSummary;
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

export function formatBlockedTicketLine(thread: BriefingTicketRow): string {
  const message = cleanBriefingText(thread.pendingMessage);
  const subject = handoffSubject(
    thread,
    `${message} ${cleanBriefingText(briefingSummarySource(thread))}`,
  );

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

  const summary = cleanBriefingText(briefingSummarySource(thread));
  if (summary) {
    const humanized = humanizeReportedSummary(subject, summary);
    if (humanized) return truncateBriefingText(humanized, HANDOFF_SUMMARY_MAX);
    return `${subject}: ${truncateBriefingText(summary, HANDOFF_SUMMARY_MAX)}`;
  }

  // Long message, no summary — the one branch that can still elide. Cut at the
  // summary budget rather than the quote budget so the most possible survives.
  if (message) return `${subject} wrote: "${truncateBriefingText(message, HANDOFF_SUMMARY_MAX)}"`;
  return formatTicketLine(thread);
}

/** Explicit human escalation the agent parked for merchant judgment. */
export function formatEscalatedTicketLine(thread: BriefingTicketRow): string {
  const summary = cleanBriefingText(briefingSummarySource(thread));
  const subject = handoffSubject(thread, summary);
  if (summary) {
    const humanized = humanizeReportedSummary(subject, summary);
    if (humanized) return `${endClause(humanized)} I flagged it for you.`;
    return `${subject}: ${truncateBriefingText(summary, HANDOFF_SUMMARY_MAX)}. I flagged it for you.`;
  }
  return `${subject} asked for a human. I flagged it for you.`;
}

function formatTicketLine(thread: BriefingTicketRow): string {
  return formatBriefingTicketLine(
    thread.customer?.name ?? null,
    thread.aiTitle ?? null,
    briefingSummarySource(thread),
    thread.tag,
    thread.channelType ?? null,
    thread.verifiedOrders ?? [],
  );
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
          updatedAt: true,
          aiTitle: true,
          aiSummary: true,
          tag: true,
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
          && classifyHomePlan(currentPlan, settings, { filterStatus: thread.filterStatus }).kind === 'quick_reply'
        ) {
          continue;
        }
      }
      const dedupeKey = pendingPlan.planId
        ?? `${pendingPlan.threadId}:${pendingPlan.planHash ?? ''}:${pendingPlan.instructionHash ?? ''}`;
      items.push({
        dedupeKey,
        threadId: pendingPlan.threadId,
        ...(pendingPlan.planId ? { planId: pendingPlan.planId } : {}),
        line: formatApprovalItemLine({
          customerName: thread?.customer?.name ?? pendingPlan.customerName ?? null,
          channelType: thread?.channelType ?? null,
          aiTitle: thread?.aiTitle ?? null,
          aiSummary: thread?.aiSummary ?? null,
          tag: thread?.tag ?? null,
          rawToolCalls: pendingPlan.rawToolCalls,
          instruction: pendingPlan.instruction,
          actionLabel: pendingPlan.actionLabel,
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
      aiSummary: true,
      requestSummary: true,
      tag: true,
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
    if (classifyHomePlan(plan, settings, { filterStatus: thread.filterStatus }).kind === 'quick_reply') {
      continue;
    }
    if (cached.planId && await isPlanExecutionResolved(organizationId, cached.planId)) {
      continue;
    }

    const dedupeKey = cached.planId ?? `thread:${thread.id}:${cached.instruction}`;
    items.push({
      dedupeKey,
      threadId: thread.id,
      ...(cached.planId ? { planId: cached.planId } : {}),
      line: formatApprovalItemLine({
        customerName: thread.customer?.name ?? null,
        channelType: thread.channelType,
        aiTitle: thread.aiTitle,
        aiSummary: thread.aiSummary,
        requestSummary: thread.requestSummary,
        tag: thread.tag,
        rawToolCalls: plan.rawToolCalls,
        instruction: cached.instruction,
        verifiedOrders: verifiedByThread.get(thread.id) ?? [],
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
  const operatorItems = await loadOperatorWaitingItems(organizationId, settings);
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
  // Do not re-sort: this list is *numbered* in the message, and the operator
  // ledger numbers `pendingPlans` in the same order, so "the second one" has to
  // mean the same plan on both sides. (`selectPendingPlan` fails closed on an
  // ordinal past the end of the queue, so the stale-thread tail is safe.)
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
  aiSummary: string | null;
  requestSummary?: string | null;
  tag: string | null;
  rawToolCalls: Array<{ id: string; name: string; input?: unknown }>;
  instruction: string;
  actionLabel?: string;
  verifiedOrders?: readonly string[];
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

  const source = params.requestSummary?.trim() || params.aiSummary;
  const summary = source?.trim();
  const humanized = summary ? humanizeReportedSummary(subject, summary) : null;
  if (humanized) return `${endClause(humanized)} ${ready}`;

  const topic = briefingTopic(params.aiTitle ?? null, source, params.tag);
  return topic ? `${subject} — ${action} · ${topic}` : `${subject} — ${action}`;
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

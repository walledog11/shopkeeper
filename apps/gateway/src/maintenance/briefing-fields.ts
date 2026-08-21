// Composes a briefing line from the classifier's structured fields instead of
// rewriting its English sentence.
//
// The prose path in `digest-briefing.ts` can only cut a sentence to fit a phone,
// so whichever fact matters most is wherever the classifier happened to put it —
// a deadline lands 180 characters in, past the truncation. Here the line is
// assembled in priority order, so length is controlled by choosing which fields
// to render.
//
// Priority: deadline, then who, then what they asked for.

import type { RequestAsk, RequestFacts } from '@shopkeeper/agent/classifier-signals';

// Closed vocabulary in, closed vocabulary out — no regex over model prose.
const ASK_LABELS: Record<RequestAsk, string> = {
  refund: 'refund',
  cancel: 'cancellation',
  return: 'return',
  exchange: 'exchange',
  address_change: 'address change',
  order_status: 'order status',
  product_question: 'product question',
  policy_question: 'policy question',
  complaint: 'complaint',
  other: '',
  none: '',
};

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const DAY_MS = 86_400_000;

function utcMidnight(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/**
 * Whole days from `now` to the deadline. Negative when the date has passed,
 * which the caller renders as overdue rather than hiding — a date the merchant
 * has already missed is the most urgent thing on the page, not the least.
 */
export function daysUntilDeadline(deadline: string | null, now: Date): number | null {
  if (!deadline) return null;
  const parsed = Date.parse(`${deadline}T00:00:00Z`);
  if (Number.isNaN(parsed)) return null;
  return Math.round((parsed - utcMidnight(now)) / DAY_MS);
}

/**
 * The deadline as the merchant would say it. Built from the date, never by
 * rewording what the customer wrote — `deadlineText` is used verbatim or not at
 * all, so there is no phrasing to repair afterwards.
 */
export function formatDeadlineLead(facts: RequestFacts, now: Date): string | null {
  const days = daysUntilDeadline(facts.deadline, now);
  if (days === null) {
    const text = facts.deadlineText?.trim();
    return text ? capitalizeFirst(text) : null;
  }
  if (days < 0) return days === -1 ? 'Overdue since yesterday' : `Overdue by ${days * -1} days`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';

  const date = new Date(`${facts.deadline}T00:00:00Z`);
  if (days < 7) return `By ${WEEKDAYS[date.getUTCDay()]}`;
  return `By ${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

function capitalizeFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * What the customer wants, from `ask` plus the optional second option they
 * offered. Null when the classifier could not name an ask, which leaves the
 * caller on the prose path rather than printing an empty segment.
 */
export function formatAskPhrase(facts: RequestFacts): string | null {
  const ask = ASK_LABELS[facts.ask];
  if (!ask) return null;
  const alternative = facts.alternative ? ASK_LABELS[facts.alternative] : '';
  const asks = alternative && alternative !== ask ? `${ask} or ${alternative}` : ask;
  return facts.subject ? `${asks} — ${facts.subject}` : asks;
}

export interface BriefingLineParts {
  /** Rendered first when present. */
  deadline: string | null;
  /** Who the item is about, supplied by the caller — naming is its own rule. */
  person: string | null;
  order: string | null;
  ask: string | null;
}

export function briefingLineParts(
  facts: RequestFacts,
  person: string | null,
  now: Date,
): BriefingLineParts {
  return {
    deadline: formatDeadlineLead(facts, now),
    person,
    order: facts.order,
    ask: formatAskPhrase(facts),
  };
}

/**
 * `By Friday — Dana · #1024: refund or exchange — the olive linen napkins`
 *
 * Null when the fields carry nothing worth a line, so the caller keeps its
 * existing prose fallback for threads classified before these fields existed.
 */
export function formatFactsBriefingLine(
  facts: RequestFacts,
  person: string | null,
  now: Date,
): string | null {
  const parts = briefingLineParts(facts, person, now);
  if (!parts.ask && !parts.deadline) return null;

  const subject = [parts.person, parts.order].filter(Boolean).join(' · ');
  const body = subject && parts.ask
    ? `${subject}: ${parts.ask}`
    : subject || capitalizeFirst(parts.ask ?? '');

  return parts.deadline ? `${parts.deadline} — ${body}` : body;
}

/**
 * Soonest deadline first, then everything undated in the order it arrived.
 * A briefing that buries the dated item under five undated ones has the same
 * defect as burying the date inside a sentence.
 */
export function byDeadlineFirst<T>(
  items: readonly T[],
  factsOf: (item: T) => RequestFacts,
  now: Date,
): T[] {
  return items
    .map((item, index) => ({ item, index, days: daysUntilDeadline(factsOf(item).deadline, now) }))
    .sort((a, b) => {
      if (a.days === null && b.days === null) return a.index - b.index;
      if (a.days === null) return 1;
      if (b.days === null) return -1;
      return a.days === b.days ? a.index - b.index : a.days - b.days;
    })
    .map((entry) => entry.item);
}

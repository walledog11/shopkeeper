import type { SupportStatsSummary } from '@shopkeeper/agent/support-stats';
import {
  countWord,
  formatNeedsYouAsk,
  formatNeedsYouProse,
  oneSentencePerLine,
} from '../digest-briefing/index.js';
import { WEEKLY_SUMMARY_MIN_TICKETS } from './constants.js';
import type { DigestBuckets, DigestMessageExtras } from './types.js';

function formatDurationShort(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes / (24 * 60))}d`;
}

// Null below three tickets a week: a stat line about one ticket is noise the
// merchant already read three lines further up.
//
// Also null when the week has no story the message hasn't already told. With
// nothing resolved and every ticket that came in still open, "five tickets in"
// is the same five tickets the line above just called open — one set described
// twice, which reads as two numbers that need reconciling. A resolution figure
// or volume above the open count is new information; neither, and the line is
// restating.
export function formatWeeklySummaryLine(
  stats: SupportStatsSummary,
  openCount: number,
): string | null {
  if (stats.tickets.total < WEEKLY_SUMMARY_MIN_TICKETS) return null;
  if (stats.resolution.closedCount === 0 && stats.tickets.total <= openCount) return null;

  // Ticket counts spell out here too. "You've got five open tickets" three
  // lines above "5 tickets in" is the same noun rendered two ways in one
  // message; the window length and the durations stay in digits.
  const parts = [`${countWord(stats.tickets.total)} tickets in`];
  const topTag = stats.tickets.byTag[0];
  // `General` is the classifier's catch-all, not a topic worth naming.
  if (topTag && topTag.count > 1 && topTag.tag !== 'General') {
    parts.push(`mostly ${topTag.tag}`);
  }
  if (stats.resolution.closedCount > 0) {
    parts.push(
      stats.resolution.avgMinutes != null
        ? `${countWord(stats.resolution.closedCount)} resolved in ${formatDurationShort(stats.resolution.avgMinutes)} on average`
        : `${countWord(stats.resolution.closedCount)} resolved`,
    );
  }
  return `Last 7 days: ${parts.join(', ')}.`;
}

// Just the disclosure that the agent binned things on the merchant's behalf.
// The 7-day retention window is deliberately not mentioned: there is no
// un-filter path on the operator channel (REVIEW relists *flagged*, not
// filtered), so quoting a deadline against a decision they cannot reverse is
// noise every single morning.
function spamSentence(filteredCount: number): string {
  return filteredCount === 1
    ? `I filed one as spam.`
    : `I filed ${countWord(filteredCount)} as spam.`;
}

/**
 * One message, one list, one ask.
 *
 * This used to print up to four separately-headed sections, each named after an
 * internal lifecycle state, two of them numbered from 1, and three different
 * closing questions. A merchant with seven things to do could not tell which
 * number belonged to which list or which question they were answering. The
 * sections were organised around what the agent knew about a thread; the
 * merchant only ever has one job, which is to clear the things that need them.
 *
 * So: everything needing the merchant is one numbered list, grouped only into
 * "a yes clears this" and "this needs a sentence". Everything needing nothing
 * collapses into the closing tail — it is news, not work, and it goes last.
 */
export function formatDigestMessage(
  buckets: DigestBuckets,
  weeklyLine?: string | null,
  extras?: DigestMessageExtras,
): string {
  const { filteredCount } = buckets;
  const items = extras?.needsYou ?? [];
  const list = formatNeedsYouProse(items);
  const ask = formatNeedsYouAsk(items);
  const lines: string[] = [];

  // The opener and the count are one sentence: "Morning, Ada here. Seven things
  // need you." Two lines for a greeting and a number is a paragraph of throat
  // clearing above the only thing worth reading.
  // The group leads carry the counts now ("Two are ready to go the moment you
  // say"), so a separate "Seven things need you" above them counts the same work
  // twice before the merchant has read any of it.
  const opener = extras?.opener?.trim();
  if (opener) lines.push(opener);
  if (list) {
    if (lines.length > 0) lines.push('');
    lines.push(list);
  }
  if (ask) lines.push('', ask);

  // The tail reports completed work only. Threads waiting on customers are
  // normal operational state, not news for the merchant, and are intentionally
  // absent rather than summarized as a vague "ticking along" count.
  const tail: string[] = [];
  if (extras?.handledSection) tail.push(extras.handledSection);
  if (extras?.preferenceBriefingLine) tail.push(extras.preferenceBriefingLine);
  if (filteredCount > 0) tail.push(spamSentence(filteredCount));
  if (tail.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push(oneSentencePerLine(tail.join(' ')));
  }

  for (const line of extras?.garnishLines ?? []) {
    lines.push('', line);
  }
  if (items.length === 0 && weeklyLine) {
    lines.push('', weeklyLine);
  }
  if (items.length === 0) {
    if (lines.length > 0) lines.push('');
    lines.push('Nothing needs you right now.');
  }

  return lines.join('\n');
}

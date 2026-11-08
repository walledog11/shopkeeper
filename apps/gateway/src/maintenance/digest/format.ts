import type { SupportStatsSummary } from '@shopkeeper/agent/support-stats';
import {
  countWord,
  formatNeedsYouProse,
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
    ? 'I also marked one message as spam.'
    : `I also marked ${countWord(filteredCount)} messages as spam.`;
}

/** A short overview, one paragraph per conversation, then completed work. */
export function formatDigestMessage(
  buckets: DigestBuckets,
  weeklyLine?: string | null,
  extras?: DigestMessageExtras,
): string {
  const { filteredCount } = buckets;
  const items = extras?.needsYou ?? [];
  const list = formatNeedsYouProse(items);
  const lines: string[] = [];

  // Count once, alongside the greeting; each paragraph owns its next step.
  const opener = extras?.opener?.trim();
  const overview = items.length === 1 ? 'One conversation needs your attention.'
    : items.length > 1 ? `${countWord(items.length).replace(/^./, (char) => char.toUpperCase())} conversations need your attention.` : '';
  if (opener || overview) lines.push([opener, overview].filter(Boolean).join(' '));
  if (list) {
    if (lines.length > 0) lines.push('');
    lines.push(list);
  }

  // The one wait on a customer the merchant hears about: a damage claim held
  // open until its photo arrives. Named, never counted.
  const photoWaitLine = extras?.photoWaitLine?.trim();
  if (photoWaitLine) {
    if (lines.length > 0) lines.push('');
    lines.push(photoWaitLine);
  }

  // The tail reports completed work only. Other threads waiting on customers
  // are normal operational state, not news for the merchant, and are
  // intentionally absent rather than summarized as a vague "ticking along" count.
  const tail: string[] = [];
  if (extras?.handledSection) tail.push(extras.handledSection);
  if (extras?.preferenceBriefingLine) tail.push(extras.preferenceBriefingLine);
  if (filteredCount > 0) tail.push(spamSentence(filteredCount));
  if (tail.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push(tail.join(' '));
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

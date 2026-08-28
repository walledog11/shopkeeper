import { BRIEFING_RECITE_MAX, KIND_ORDER } from './constants.js';
import { capitalize, countWord, oneSentencePerLine } from './text.js';
import type { BriefingItem } from './types.js';

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

function threadReviewLead(count: number): string {
  return count === 1
    ? 'One needs you to open the thread first.'
    : `${capitalize(countWord(count))} need you to open their threads first.`;
}

export function formatNeedsYouProse(items: BriefingItem[]): string | null {
  if (items.length === 0) return null;

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
    const group = items.filter((item) => item.kind === kind && item.needsThreadReview !== true);
    if (group.length === 0) continue;
    if (blocks.length > 0) blocks.push('');
    blocks.push(groupLead(kind, group.length), '');
    blocks.push(group.map((item) => oneSentencePerLine(item.line)).join('\n\n'));
  }
  const threadReviews = items.filter((item) => item.needsThreadReview === true);
  if (threadReviews.length > 0) {
    if (blocks.length > 0) blocks.push('');
    blocks.push(threadReviewLead(threadReviews.length), '');
    blocks.push(threadReviews.map((item) => oneSentencePerLine(item.line)).join('\n\n'));
  }
  return blocks.join('\n');
}

export function formatNeedsYouAsk(items: BriefingItem[]): string | null {
  if (items.length === 0 || items.length > BRIEFING_RECITE_MAX) return null;
  if (items.some((item) => item.needsThreadReview === true)) return null;
  const readyOnly = items.every((item) => item.kind === 'approval');
  if (readyOnly) {
    return 'Should I go ahead?';
  }
  return items.length === 1 ? 'What do you want to do?' : 'Tell me what you want to do with these.';
}

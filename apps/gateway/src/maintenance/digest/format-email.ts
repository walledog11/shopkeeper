import type { WorkspaceNotice } from '../../operator-email.js';
import { BRIEFING_RECITE_MAX } from '../digest-briefing/constants.js';
import type { BriefingItem } from '../digest-briefing/index.js';
import { capitalize, countWord } from '../digest-briefing/text.js';
import type { OrgDigest } from './types.js';

// What each conversation waits on, said to someone who will act in the app.
const WAITING_ON: Record<BriefingItem['kind'], string> = {
  approval: "It's waiting for your approval.",
  decision: 'It needs your decision.',
  flagged: 'It may not be a real customer message: keep it or mark it as spam.',
};

function itemParagraph(item: BriefingItem): string {
  const { person, request, threadUrl } = item.conversation;
  const line = item.needsThreadReview
    ? `I couldn't retrieve the request details for ${person}'s conversation.`
    : `${request} ${WAITING_ON[item.kind]}`;
  return threadUrl ? `${line}\n${threadUrl}` : line;
}

/**
 * The briefing for a workspace with no linked phone. The text a phone gets asks
 * questions to answer by reply ("Shall I go ahead with this plan?"); this one
 * lists what needs the merchant, each with its link, then what was handled.
 */
export function formatDigestEmail(
  digest: OrgDigest,
  opener: string | null,
): Pick<WorkspaceNotice, 'kind' | 'subject' | 'paragraphs'> {
  const count = digest.needsYou.length;
  const listed = digest.needsYou.slice(0, BRIEFING_RECITE_MAX);
  const paragraphs = [
    opener,
    ...listed.map(itemParagraph),
    count > listed.length ? `${capitalize(countWord(count - listed.length))} more are waiting in the app.` : null,
    digest.handledSection,
    count === 0 ? 'Nothing needs you right now.' : null,
  ].filter((paragraph): paragraph is string => Boolean(paragraph));
  return {
    kind: 'briefing',
    subject: count === 0
      ? 'Your briefing: nothing needs you'
      : `Your briefing: ${countWord(count)} ${count === 1 ? 'conversation needs' : 'conversations need'} you`,
    paragraphs,
  };
}

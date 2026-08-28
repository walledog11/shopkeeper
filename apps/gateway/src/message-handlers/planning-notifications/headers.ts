import type { DbChannelType } from '@shopkeeper/db';
import {
  personLabel,
  personSubject,
  type PersonName,
} from '@shopkeeper/agent/person-name';
import { CHANNEL } from '../../constants.js';
import { formatChannelLabel } from '../../lib/channel-format.js';
import {
  formatRequestDisplayLine,
  type RequestDisplay,
} from '../request-display.js';
import type { ConversationStage } from './types.js';

// In-sentence channel wording: "New Instagram DM from Jane", "Jane replied on Instagram".
export function channelNoun(channelType: DbChannelType): string {
  if (channelType === CHANNEL.IG_DM) return 'Instagram DM';
  if (channelType === CHANNEL.EMAIL) return 'email';
  if (channelType === CHANNEL.TIKTOK) return 'TikTok message';
  if (channelType === CHANNEL.SHOPIFY_CHAT) return 'storefront chat message';
  return `${formatChannelLabel(channelType)} message`;
}

export function channelRepliedPhrase(channelType: DbChannelType): string {
  if (channelType === CHANNEL.IG_DM) return 'on Instagram';
  if (channelType === CHANNEL.EMAIL) return 'by email';
  if (channelType === CHANNEL.TIKTOK) return 'on TikTok';
  if (channelType === CHANNEL.SHOPIFY_CHAT) return 'in your storefront chat';
  return `on ${formatChannelLabel(channelType)}`;
}

// Summaries are model-written and arrive with or without a final stop; without
// one they run into whatever follows.
export function endSentence(text: string): string {
  return /[.!?…"']$/.test(text.trim()) ? text.trim() : `${text.trim()}.`;
}

// Two lines, not one joined by an em-dash. The summary is model-written prose
// that routinely carries its own commas, colons and quotes, so splicing it after
// a dash produces a sentence with three kinds of punctuation fighting.
export function formatHeaderLines(
  person: PersonName,
  channelType: DbChannelType,
  summary: string,
  stage: ConversationStage,
): string[] {
  const firstName = person.kind === 'named' ? person.firstName : null;
  let lead: string;
  if (stage.isFollowUp) {
    const who = personSubject(person);
    lead = stage.newMessages > 1
      ? `${who} sent ${stage.newMessages} more messages ${channelRepliedPhrase(channelType)}`
      : `${who} replied ${channelRepliedPhrase(channelType)}`;
  } else {
    const from = firstName ? ` from ${firstName}` : '';
    const burst = stage.newMessages > 1 ? ` (${stage.newMessages} messages)` : '';
    lead = `New ${channelNoun(channelType)}${from}${burst}`;
  }
  // `summary` is the thread's requestSummary — the newest unanswered burst, the
  // same messages `lead` just counted. It was the episode summary once, which
  // described the whole conversation and so restated everything as if it were
  // news; the `Where it stands:` label existed to stop that from reading as a
  // delta. The summariser scopes it to the burst now, so it *is* the delta and
  // the label would understate it.
  return [`${lead}.`, endSentence(summary)];
}

export function formatRequestHeaderLines(
  person: PersonName,
  channelType: DbChannelType,
  display: RequestDisplay,
  stage: ConversationStage,
  now: Date,
): string[] {
  // Reuse the established channel/stage sentence, but never its prose summary.
  const lead = formatHeaderLines(person, channelType, '', stage)[0]!;
  const request = formatRequestDisplayLine(display, personLabel(person), now);
  return [
    lead,
    endSentence(request),
  ];
}

import { DIGEST_CURSOR_KEY, COUNT_WORDS, DEFAULT_HANDLED_LOOKBACK_MS } from './constants.js';
import { isRecord } from '../../lib/typing.js';

export function countWord(count: number): string {
  return COUNT_WORDS[count] ?? String(count);
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function extractRefundAmount(input: unknown): string | null {
  if (!isRecord(input)) return null;
  const amount = input.amount;
  if (typeof amount === 'number' && Number.isFinite(amount)) {
    return `$${amount % 1 === 0 ? amount.toFixed(0) : amount.toFixed(2)}`;
  }
  return null;
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

export function cleanBriefingText(text: string | null | undefined): string {
  return redactBriefingContacts((text ?? '').replace(/\s+/g, ' ').trim());
}

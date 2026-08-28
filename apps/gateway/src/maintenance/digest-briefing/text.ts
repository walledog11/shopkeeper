import { DIGEST_CURSOR_KEY, COUNT_WORDS, DEFAULT_HANDLED_LOOKBACK_MS } from './constants.js';

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

export function endClause(text: string): string {
  return /[.!?…"']$/.test(text) ? text : `${text}.`;
}

/**
 * One sentence per line. On a phone, two sentences sharing a line wrap into a
 * paragraph and the eye has to find where one item ends and the next begins.
 */
export function oneSentencePerLine(text: string): string {
  let out = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]!;
    out += char;
    if (char === '"') quoted = !quoted;
    if (quoted || !'.!?'.includes(char)) continue;
    const rest = text.slice(i + 1);
    const gap = rest.match(/^[ \t]+/);
    if (!gap || !/^[A-Z"]/.test(rest.slice(gap[0].length))) continue;
    out += '\n';
    i += gap[0].length;
  }
  return out;
}

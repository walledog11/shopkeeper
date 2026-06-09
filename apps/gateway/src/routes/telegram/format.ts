const FILLER_PHRASES = [
  'On it…',
  'Give me a sec…',
  'Making it happen…',
  'Looking into that…',
  'Just a moment…',
];

export const HELP_TEXT = [
  'Shopkeeper commands:',
  'SUMMARY — your current support inbox',
  '#1234 — look up a ticket by its order number',
  'After a summary, act on a flagged ticket:',
  '  OPEN <n> · SPAM <n> · REPLY <n> <text> · REVIEW to re-list',
  "Or just send an instruction like 'refund #1234'.",
].join('\n');

export function filler(): string {
  return FILLER_PHRASES[Math.floor(Math.random() * FILLER_PHRASES.length)];
}

export function relativeAge(ms: number | null): string {
  if (ms == null) return '';
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
}

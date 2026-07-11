export const HELP_TEXT = [
  'Shopkeeper commands:',
  'SUMMARY — your current support inbox',
  'After a summary, act on a flagged ticket:',
  '  OPEN <n> · SPAM <n> · REPLY <n> <text> · REVIEW to re-list',
  "Or just send an instruction like 'refund #1234' or 'where is #1234?'.",
].join('\n');

export function relativeAge(ms: number | null): string {
  if (ms == null) return '';
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
}

export const HELP_TEXT = [
  "Text me like you'd text an employee:",
  '  "refund #1234" · "where is #1234?" · "how many tickets came in last week?"',
  'I\'ll check with you before anything customer-facing — reply yes or no to whatever I propose.',
  '',
  'Shortcuts: SUMMARY for your inbox, then OPEN <n> · SPAM <n> · REPLY <n> <text> · REVIEW to re-list.',
].join('\n');

export function relativeAge(ms: number | null): string {
  if (ms == null) return '';
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
}

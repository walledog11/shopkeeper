// The gateway's sentence helpers. `lowerFirst` is the one every package uses.
export { lowerFirst } from '@shopkeeper/shared/text';

// Summaries are model-written and arrive with or without a final stop; without
// one they run into whatever follows.
export function endSentence(text: string): string {
  return /[.!?…"']$/.test(text.trim()) ? text.trim() : `${text.trim()}.`;
}

export const AGENT_LEARNED_KB_TAG = "agent-learned" as const;

export function buildMerchantAnswerKbTags(
  threadTag: string | null | undefined,
  topicTags: readonly string[] = [],
): string[] {
  const tags: string[] = [AGENT_LEARNED_KB_TAG];
  for (const tag of topicTags) {
    const trimmed = tag.trim();
    if (trimmed && !tags.some((existing) => existing.toLowerCase() === trimmed.toLowerCase())) {
      tags.push(trimmed);
    }
  }
  const trimmedThreadTag = threadTag?.trim();
  if (trimmedThreadTag && !tags.some((existing) => existing.toLowerCase() === trimmedThreadTag.toLowerCase())) {
    tags.push(trimmedThreadTag);
  }
  return tags;
}

export function isAgentLearnedKbArticle(tags: readonly string[]): boolean {
  return tags.some((tag) => tag.toLowerCase() === AGENT_LEARNED_KB_TAG);
}

export function kbTagsForDisplay(tags: readonly string[]): string[] {
  return tags.filter((tag) => tag.toLowerCase() !== AGENT_LEARNED_KB_TAG);
}

export function buildMerchantAnswerPlanningInstruction(input: {
  baseInstruction: string;
  question: string | null;
  answer: string;
  saveToKb: boolean;
}): string {
  if (!input.question) return input.baseInstruction;

  const savedNote = input.saveToKb
    ? " This answer is saved in the knowledge base — use it and do not ask again."
    : " Use this to draft the customer reply — do not ask again.";

  return `${input.baseInstruction}\n\nThe store owner answered your question "${input.question}" with: "${input.answer}".${savedNote}`;
}

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

  // A label question answered with a URL is an actionable artifact, not just reply
  // material: the return is already open from the turn that asked, so the label must
  // be attached — without this the model drafts the reply and skips the attach step.
  const labelNote = /label/i.test(input.question) && /https?:\/\//i.test(input.answer)
    ? " The answer is a return label URL: call attach_return_label with the order_id and this URL, then include the link in your reply to the customer. The return itself is already open - do NOT call create_return or create_exchange again."
    : "";

  return `${input.baseInstruction}\n\nThe store owner answered your question "${input.question}" with: "${input.answer}".${savedNote}${labelNote}`;
}

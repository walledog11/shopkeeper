export const AGENT_LEARNED_KB_TAG = "agent-learned" as const;

export function buildMerchantAnswerKbTags(topicTags: readonly string[] = []): string[] {
  const tags: string[] = [AGENT_LEARNED_KB_TAG];
  for (const tag of topicTags) {
    const trimmed = tag.trim();
    if (trimmed && !tags.some((existing) => existing.toLowerCase() === trimmed.toLowerCase())) {
      tags.push(trimmed);
    }
  }
  return tags;
}

export function isAgentLearnedKbArticle(tags: readonly string[]): boolean {
  return tags.some((tag) => tag.toLowerCase() === AGENT_LEARNED_KB_TAG);
}

const MERCHANT_ANSWER_INSTRUCTION_RE = /The store owner answered your question/i;

export function isMerchantAnswerPlanningInstruction(instruction: string): boolean {
  return MERCHANT_ANSWER_INSTRUCTION_RE.test(instruction);
}

export function buildMerchantAnswerPlanningInstruction(input: {
  baseInstruction: string;
  question: string | null;
  answer: string;
  saveToKb: boolean;
}): string {
  if (!input.question) {
    return `${input.baseInstruction}\n\nThe store owner revised the proposal with: "${input.answer}". Use their guidance to draft the replacement proposal.`;
  }

  const kbNote = input.saveToKb
    ? " The answer is already saved in the knowledge base — do not ask again and do not call add_internal_note to record the Q&A."
    : "";

  return `${input.baseInstruction}\n\nThe store owner answered your question "${input.question}" with: "${input.answer}". Use this to draft send_reply to the customer — do not ask again.${kbNote}`;
}

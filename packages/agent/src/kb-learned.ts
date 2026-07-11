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

export function kbTagsForDisplay(tags: readonly string[]): string[] {
  return tags.filter((tag) => tag.toLowerCase() !== AGENT_LEARNED_KB_TAG);
}

const MERCHANT_ANSWER_INSTRUCTION_RE = /The store owner answered your question/i;

export function isMerchantAnswerPlanningInstruction(instruction: string): boolean {
  return MERCHANT_ANSWER_INSTRUCTION_RE.test(instruction);
}

export function merchantAnswerReplyDraftPrompt(settings?: { brandVoice?: string | null }): string {
  const brandNote = settings?.brandVoice?.trim()
    ? " Follow the brand voice section exactly, including any banned phrases or tone constraints."
    : "";
  return [
    "The store owner answered your policy question.",
    "Call send_reply now to answer the customer using their answer.",
    "The Q&A is already saved in the knowledge base — do NOT call add_internal_note to record it again.",
    "Do NOT close or change thread status before sending the customer reply.",
    brandNote,
  ].filter(Boolean).join(" ");
}

export function buildMerchantAnswerPlanningInstruction(input: {
  baseInstruction: string;
  question: string | null;
  answer: string;
  saveToKb: boolean;
}): string {
  if (!input.question) return input.baseInstruction;

  const kbNote = input.saveToKb
    ? " The answer is already saved in the knowledge base — do not ask again and do not call add_internal_note to record the Q&A."
    : "";

  // A label question answered with a URL is an actionable artifact, not just reply
  // material: the return is already open from the turn that asked, so the label must
  // be attached — without this the model drafts the reply and skips the attach step.
  const labelNote = /label/i.test(input.question) && /https?:\/\//i.test(input.answer)
    ? " The answer is a return label URL: call attach_return_label with the order_id and this URL, then include the link in your reply to the customer. The return itself is already open - do NOT call create_return or create_exchange again."
    : "";

  return `${input.baseInstruction}\n\nThe store owner answered your question "${input.question}" with: "${input.answer}". Use this to draft send_reply to the customer — do not ask again.${kbNote}${labelNote}`;
}

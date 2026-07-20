import type { AgentRecentMessage } from "./agent-context.js";

export const CONTEXT_BUDGETS = {
  recentMessageCount: 20,
  recentMessageChars: 24_000,
  perMessageChars: 6_000,
  priorSummaryChars: 1_000,
  pastTicketSummaryChars: 1_000,
  kbArticleCount: 3,
  kbTitleChars: 200,
  kbArticleBodyChars: 6_000,
  kbTotalChars: 14_000,
  searchedKbArticleCount: 5,
  searchedKbTotalChars: 16_000,
  classifierMessageCount: 20,
  classifierMessageChars: 16_000,
  classifierPerMessageChars: 4_000,
  classifierInputChars: 18_000,
  emailSubjectChars: 500,
  instructionChars: 12_000,
  operatorLedgerChars: 8_000,
  storeProfileChars: 6_000,
  brandVoiceChars: 3_000,
  sampleReplyBodyChars: 1_000,
  sampleReplyContextChars: 300,
  recentOrdersChars: 20_000,
} as const;

export type ContextBudgetMode = "off" | "shadow" | "enforce";

export interface ContextBudgetStats {
  beforeCount: number;
  afterCount: number;
  beforeChars: number;
  afterChars: number;
  truncated: boolean;
  estimatedTokens: number;
}

const TRUNCATION_MARKER = "\n[truncated]";

export function resolveContextBudgetMode(
  value: string | undefined = process.env.AGENT_CONTEXT_BUDGET_MODE,
): ContextBudgetMode {
  if (value === undefined || value.trim() === "") return "off";
  if (value === "off" || value === "shadow" || value === "enforce") return value;
  throw new Error("AGENT_CONTEXT_BUDGET_MODE must be off, shadow, or enforce");
}

export function truncateContextText(value: string | null | undefined, maxChars: number): string {
  const text = value?.trim() ?? "";
  if (text.length <= maxChars) return text;
  if (maxChars <= TRUNCATION_MARKER.length) return text.slice(0, maxChars);
  return `${text.slice(0, maxChars - TRUNCATION_MARKER.length)}${TRUNCATION_MARKER}`;
}

export function estimateInputTokensFromChars(chars: number): number {
  return Math.ceil(Math.max(0, chars) / 4);
}

function messageChars(message: Pick<AgentRecentMessage, "contentText">): number {
  return message.contentText?.length ?? 0;
}

export function budgetRecentMessages<T extends AgentRecentMessage>(
  messages: readonly T[],
  options: {
    maxCount?: number;
    maxTotalChars?: number;
    maxMessageChars?: number;
  } = {},
): { messages: T[]; stats: ContextBudgetStats } {
  const maxCount = options.maxCount ?? CONTEXT_BUDGETS.recentMessageCount;
  const maxTotalChars = options.maxTotalChars ?? CONTEXT_BUDGETS.recentMessageChars;
  const maxMessageChars = options.maxMessageChars ?? CONTEXT_BUDGETS.perMessageChars;
  const candidates = messages.slice(-maxCount);
  const selected: T[] = [];
  let remainingChars = maxTotalChars;

  // Newest content is most relevant. Walk backward through the bounded window,
  // then restore chronological order for the model API.
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const message = candidates[index];
    const content = message.contentText ?? "";
    const allowedChars = Math.min(maxMessageChars, remainingChars);
    const boundedContent = allowedChars > 0
      ? truncateContextText(content, allowedChars)
      : "";
    const hasAttachments = (message.attachments?.length ?? 0) > 0;
    if (boundedContent || hasAttachments || content.length === 0) {
      selected.push({
        ...message,
        contentText: boundedContent || null,
      } as T);
      remainingChars -= boundedContent.length;
    }
    if (remainingChars <= 0) break;
  }

  selected.reverse();
  const beforeChars = messages.reduce((sum, message) => sum + messageChars(message), 0);
  const afterChars = selected.reduce((sum, message) => sum + messageChars(message), 0);
  return {
    messages: selected,
    stats: {
      beforeCount: messages.length,
      afterCount: selected.length,
      beforeChars,
      afterChars,
      truncated: selected.length !== messages.length || afterChars !== beforeChars,
      estimatedTokens: estimateInputTokensFromChars(afterChars),
    },
  };
}

type KbArticle = { title: string; body: string };

export function budgetKbArticles<T extends KbArticle>(
  articles: readonly T[],
  options: { maxCount?: number; maxTotalChars?: number } = {},
): { articles: T[]; stats: ContextBudgetStats } {
  const maxCount = options.maxCount ?? CONTEXT_BUDGETS.kbArticleCount;
  const maxTotalChars = options.maxTotalChars ?? CONTEXT_BUDGETS.kbTotalChars;
  const selected: T[] = [];
  let remainingChars = maxTotalChars;

  for (const article of articles.slice(0, maxCount)) {
    if (remainingChars <= 0) break;
    const title = truncateContextText(
      article.title,
      Math.min(CONTEXT_BUDGETS.kbTitleChars, remainingChars),
    );
    remainingChars -= title.length;
    const body = truncateContextText(
      article.body,
      Math.min(CONTEXT_BUDGETS.kbArticleBodyChars, remainingChars),
    );
    remainingChars -= body.length;
    selected.push({ ...article, title, body });
  }

  const beforeChars = articles.reduce(
    (sum, article) => sum + article.title.length + article.body.length,
    0,
  );
  const afterChars = selected.reduce(
    (sum, article) => sum + article.title.length + article.body.length,
    0,
  );
  return {
    articles: selected,
    stats: {
      beforeCount: articles.length,
      afterCount: selected.length,
      beforeChars,
      afterChars,
      truncated: selected.length !== articles.length || afterChars !== beforeChars,
      estimatedTokens: estimateInputTokensFromChars(afterChars),
    },
  };
}

export function buildBoundedClassifierConversation(
  messages: readonly Pick<AgentRecentMessage, "senderType" | "contentText">[],
  priorSummary?: string | null,
): { text: string; stats: ContextBudgetStats } {
  const budgeted = budgetRecentMessages(messages, {
    maxCount: CONTEXT_BUDGETS.classifierMessageCount,
    maxTotalChars: CONTEXT_BUDGETS.classifierMessageChars,
    maxMessageChars: CONTEXT_BUDGETS.classifierPerMessageChars,
  });
  const summary = truncateContextText(priorSummary, CONTEXT_BUDGETS.priorSummaryChars);
  const parts = [
    ...(summary ? [`PRIOR SUMMARY: ${summary}`] : []),
    ...budgeted.messages.map((message) => (
      `${message.senderType.toUpperCase()}: ${message.contentText ?? "(media)"}`
    )),
  ];
  const text = truncateContextText(parts.join("\n"), CONTEXT_BUDGETS.classifierInputChars);
  return {
    text,
    stats: {
      ...budgeted.stats,
      afterChars: text.length,
      truncated: budgeted.stats.truncated || text.length < parts.join("\n").length,
      estimatedTokens: estimateInputTokensFromChars(text.length),
    },
  };
}

export function buildBoundedEmailClassifierInput(subject: string, body: string): string {
  const boundedSubject = truncateContextText(subject, CONTEXT_BUDGETS.emailSubjectChars);
  const prefix = `Subject: ${boundedSubject}\n\nBody: `;
  const bodyBudget = Math.max(0, CONTEXT_BUDGETS.classifierInputChars - prefix.length);
  return `${prefix}${truncateContextText(body, bodyBudget)}`;
}

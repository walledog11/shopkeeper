import type Anthropic from "@anthropic-ai/sdk";
import type { TaskModelBudget } from "./agent-context.js";
import { anthropic, HAIKU_MODEL, isDeterministicE2EAIEnabled } from "./ai/index.js";
import logger from "./logger.js";
import { enforceSpendCap, recordSpend, type SpendCapSettings } from "./spend.js";
import type { KnowledgeBaseToolArticle } from "./tools/registry/types.js";
import { readModelUsage } from "./usage.js";

// Word matching finds candidates, not answers: a store's synced legal pages
// contain nearly every word a support question uses, so a search almost never
// came back empty and "the knowledge base has nothing on this" — the fact that
// makes the planner ask the merchant instead of guessing store policy — could
// not be observed. This decides which candidates actually answer the query.

const RELEVANCE_SYSTEM_PROMPT = `You decide which knowledge base articles answer a support question for one store.
An article answers the question only if its text states this store's own policy, procedure or facts on what is asked.
An article that merely shares words with the question, such as a legal or general page that mentions the same terms without covering the subject, does not answer it.
Judge only from the text shown. Return the numbers of the articles that answer the question, or an empty list if none do.`;

const RELEVANCE_OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    answering: { type: "array", items: { type: "integer" } },
  },
  required: ["answering"],
  additionalProperties: false,
} as const;

function relevanceInput(query: string, articles: readonly KnowledgeBaseToolArticle[]): string {
  const listed = articles.map((article, index) => `[${index + 1}] ${article.title}\n${article.body}`);
  return `Question: ${query}\n\n${listed.join("\n\n")}`;
}

// Validate, don't repair: an index outside the list means the answer is not
// about these articles, so nothing it says is used.
function answeringIndices(response: Anthropic.Message, count: number): number[] | null {
  const block = response.content.find((part): part is Anthropic.TextBlock => part.type === "text");
  if (!block) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(block.text);
  } catch {
    return null;
  }
  const answering = (parsed as { answering?: unknown } | null)?.answering;
  if (!Array.isArray(answering)) return null;
  const indices = new Set<number>();
  for (const value of answering) {
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > count) return null;
    indices.add(value);
  }
  return [...indices].sort((a, b) => a - b);
}

/**
 * The candidates that answer `query`, or `null` when that could not be decided.
 * The caller treats `null` as unanswered: guessing policy is the failure this
 * exists to prevent. Spend counts against the org cap and the task budget like
 * any planning model call.
 */
export async function selectAnsweringKbArticles(request: {
  orgId: string;
  query: string;
  articles: readonly KnowledgeBaseToolArticle[];
  settings: SpendCapSettings | null | undefined;
  taskBudget?: TaskModelBudget;
}): Promise<KnowledgeBaseToolArticle[] | null> {
  const { orgId, query, articles } = request;
  if (articles.length === 0) return [];
  if (isDeterministicE2EAIEnabled()) return [...articles];

  await enforceSpendCap(orgId, request.settings);
  await request.taskBudget?.reserveModelCall();

  let response: Anthropic.Message;
  try {
    response = await anthropic.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 256,
      system: RELEVANCE_SYSTEM_PROMPT,
      output_config: { format: { type: "json_schema", schema: RELEVANCE_OUTPUT_SCHEMA } },
      messages: [{ role: "user", content: relevanceInput(query, articles) }],
    });
  } catch (err) {
    logger.warn({ err, orgId, candidates: articles.length }, "[agent:kb] relevance check failed");
    return null;
  }

  const usage = readModelUsage(response);
  await recordSpend(orgId, usage, HAIKU_MODEL);
  await request.taskBudget?.recordModelUsage(usage, HAIKU_MODEL);

  const indices = answeringIndices(response, articles.length);
  logger.info({
    orgId,
    purpose: "kb_relevance",
    candidates: articles.length,
    answering: indices?.length ?? null,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
  }, "[agent:kb] relevance");
  return indices === null ? null : indices.map((index) => articles[index - 1]!);
}

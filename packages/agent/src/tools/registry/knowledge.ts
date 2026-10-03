import { toolNotFound, toolOk } from "../result.js";
import { threadContextOf } from "./helpers.js";
import { defineTool, stringArg } from "./schema.js";
import type { SearchKbInput } from "./types.js";

export const KNOWLEDGE_TOOL_DEFINITIONS = [
  defineTool({
    name: "search_kb",
    description:
      "Search the organization's knowledge base for articles matching a query. Use this to find store policies, FAQs, or how-to guides before answering customer questions about returns, shipping, or store procedures.",
    fields: {
      query: stringArg("Search terms to look for in knowledge base article titles and bodies (e.g. 'return policy', 'shipping times').", { required: true }),
    },
    category: "read",
    group: "knowledge",
    capabilities: ["kb"],
    label: "Searched knowledge base",
    planStepLabel: "Search knowledge base",
    execute: async (input: SearchKbInput, ctx, settings, deps) => {
      const words = input.query.trim().split(/\s+/).filter((word) => word.length >= 2);
      if (words.length === 0) return toolNotFound("No knowledge base articles found for that query.");

      const candidates = await deps.searchKnowledgeBaseArticles(ctx.orgId, words);
      if (candidates.length === 0) return toolNotFound("No knowledge base articles found for that query.");

      // A word match is only a candidate. What comes back, and what is cited, is
      // what answers the query, so an empty answer stays observable as not_found.
      const articles = await deps.selectAnsweringKbArticles({
        orgId: ctx.orgId,
        query: input.query,
        articles: candidates,
        settings,
        ...(ctx.taskBudget ? { taskBudget: ctx.taskBudget } : {}),
      });
      if (articles === null) {
        return toolNotFound("Could not confirm that any knowledge base article answers that query, so treat it as unanswered.");
      }
      if (articles.length === 0) return toolNotFound("No knowledge base article answers that query.");

      const kbThreadCtx = threadContextOf(ctx);
      if (kbThreadCtx) {
        await deps.recordKnowledgeBaseCitations(ctx.orgId, kbThreadCtx.threadId, articles.map((article) => article.id));
      }

      return toolOk(JSON.stringify(articles.map((article) => ({
        title: article.title,
        body: article.body,
        tags: article.tags,
      }))));
    },
  }),
] as const;

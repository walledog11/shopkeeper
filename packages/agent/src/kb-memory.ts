import { isAgentLearnedKbArticle } from "./kb-learned.js";

export const LEARNED_KB_FOLDER = "Learned" as const;
export const NOTES_KB_FOLDER = "Notes" as const;
export const MEMORY_OVERRIDE_TAG = "merchant-override" as const;
export const MEMORY_OVERRIDE_TARGET_PREFIX = "overrides:" as const;

export const MEMORY_TOPIC_TAGS = ["shipping", "returns", "discounts", "wholesale"] as const;
export type MemoryTopicTag = (typeof MEMORY_TOPIC_TAGS)[number];

const TOPIC_FOLDER_NAMES: Record<MemoryTopicTag, string> = {
  shipping: "Shipping",
  returns: "Returns",
  discounts: "Discounts",
  wholesale: "Wholesale",
};

export type MemoryArticleSource = "learned" | "shopify" | "manual";

export function memoryOverrideTargetTag(articleId: string): string {
  return `${MEMORY_OVERRIDE_TARGET_PREFIX}${articleId}`;
}

export function memoryOverrideTargetId(tags: readonly string[]): string | null {
  const tag = tags.find(candidate => candidate.startsWith(MEMORY_OVERRIDE_TARGET_PREFIX));
  return tag?.slice(MEMORY_OVERRIDE_TARGET_PREFIX.length).trim() || null;
}

export function memoryOverrideTargetIds(
  articles: readonly { tags: readonly string[] }[],
): string[] {
  return [...new Set(articles.flatMap(article => {
    const targetId = memoryOverrideTargetId(article.tags);
    return targetId ? [targetId] : [];
  }))];
}

export function resolveEffectiveMemoryArticles<T extends { id: string; tags: readonly string[] }>(
  articles: readonly T[],
): T[] {
  const overriddenIds = new Set(memoryOverrideTargetIds(articles));
  return articles.filter(article => !overriddenIds.has(article.id));
}

export function resolveTopicFolderName(topicTags: readonly string[]): string {
  for (const tag of topicTags) {
    const folder = TOPIC_FOLDER_NAMES[tag.toLowerCase() as MemoryTopicTag];
    if (folder) return folder;
  }
  return LEARNED_KB_FOLDER;
}

export function classifyMemoryArticleSource(input: {
  baseSource: string;
  tags: readonly string[];
}): MemoryArticleSource {
  if (input.baseSource === "shopify") return "shopify";
  if (isAgentLearnedKbArticle(input.tags)) return "learned";
  return "manual";
}

export function memoryTopicLabel(tag: string): string {
  const normalized = tag.trim().toLowerCase();
  if (normalized === "shipping") return "Shipping";
  if (normalized === "returns") return "Returns";
  if (normalized === "discounts") return "Discounts";
  if (normalized === "wholesale") return "Wholesale";
  return tag.trim();
}

export function isMemoryTopicTag(tag: string): tag is MemoryTopicTag {
  return (MEMORY_TOPIC_TAGS as readonly string[]).includes(tag.toLowerCase());
}

import { db, getOrCreateNotesKnowledgeBase } from "@shopkeeper/db";
import { AGENT_LEARNED_KB_TAG, buildMerchantAnswerKbTags } from "./kb-learned.js";
import {
  LEARNED_KB_FOLDER,
  MEMORY_OVERRIDE_TAG,
  NOTES_KB_FOLDER,
  memoryOverrideTargetId,
  resolveTopicFolderName,
} from "./kb-memory.js";
import { MERCHANT_ANSWER_NAMES, merchantAnswerQuestion, readBlankAnswer } from "./reply-placeholders.js";
import type { MerchantAnswerName, MerchantAnswers } from "./types.js";
import { DISCOUNT_POLICY_QUESTION_RES, SHIPPING_COVERAGE_QUESTION_RES } from "./intent.js";
import { channelDisplayName } from "./thread-constants.js";

const RETURN_POLICY_QUESTION_RES: readonly RegExp[] = [
  /\breturn\s+policy\b/,
  /\b(can|may)\s+i\s+return\b/,
  /\bdo\s+you\s+(accept|allow|offer)\s+returns\b/,
  /\bhow\s+(do|can)\s+i\s+return\b/,
];

// The answer-side discount check adds a broader "do you offer discounts" catch on
// top of the shared question regexes (which intent.ts uses for the tighter
// policy-gap routing decision).
const DISCOUNT_POLICY_ANSWER_RES: readonly RegExp[] = [
  ...DISCOUNT_POLICY_QUESTION_RES,
  /\bdo\s+you\s+offer\s+(any|a)?\s*discounts?\b/i,
];

const WHOLESALE_QUESTION_RES: readonly RegExp[] = [
  /\bwholesale\b/,
  /\bbulk\s+order\b/,
  /\bstockist\b/,
];

export interface SaveMerchantAnswerToKbInput {
  organizationId: string;
  threadId: string;
  question: string | null;
  answer: string;
  threadTag?: string | null;
  channelType: string;
  threadSummary?: string | null;
}

export interface SaveMerchantAnswerToKbResult {
  articleId: string;
  title: string;
  body: string;
  created: boolean;
  updated: boolean;
}

export interface MerchantAnswerKbArticleContent {
  title: string;
  body: string;
  tags: string[];
}

function policyText(question: string | null, answer: string): string {
  return `${question ?? ""} ${answer}`.toLowerCase();
}

export function deriveMerchantAnswerTopicTags(question: string | null, answer: string): string[] {
  const text = policyText(question, answer);
  const tags: string[] = [];
  if (SHIPPING_COVERAGE_QUESTION_RES.some((re) => re.test(text))) tags.push("shipping");
  if (RETURN_POLICY_QUESTION_RES.some((re) => re.test(text))) tags.push("returns");
  if (DISCOUNT_POLICY_ANSWER_RES.some((re) => re.test(text))) tags.push("discounts");
  if (WHOLESALE_QUESTION_RES.some((re) => re.test(text))) tags.push("wholesale");
  return tags;
}

export function deriveMerchantAnswerKbTitle(question: string | null, answer: string): string {
  const text = policyText(question, answer);
  if (SHIPPING_COVERAGE_QUESTION_RES.some((re) => re.test(text))) return "International shipping";
  if (RETURN_POLICY_QUESTION_RES.some((re) => re.test(text))) return "Return policy";
  if (DISCOUNT_POLICY_ANSWER_RES.some((re) => re.test(text))) return "Discount policy";
  if (WHOLESALE_QUESTION_RES.some((re) => re.test(text))) return "Wholesale inquiries";

  const raw = (question ?? answer).trim();
  if (!raw) return "Store policy";
  const normalized = raw.charAt(0).toUpperCase() + raw.slice(1);
  if (normalized.length <= 255) return normalized;
  return `${normalized.slice(0, 252).trim()}…`;
}

export function formatMerchantAnswerChannelLabel(channelType: string): string {
  return channelDisplayName(channelType, "Message");
}

export function buildMerchantAnswerContextLine(input: {
  channelType: string;
  threadSummary?: string | null;
}): string {
  const channel = formatMerchantAnswerChannelLabel(input.channelType);
  const topic = input.threadSummary?.trim();
  if (topic) return `Customer asked via ${channel}, thread about ${topic}.`;
  return `Customer asked via ${channel}.`;
}

export function buildMerchantAnswerKbBody(input: {
  question: string | null;
  answer: string;
  contextLine: string;
}): string {
  const lines = [
    input.question ? `Q: ${input.question.trim()}` : null,
    `A: ${input.answer.trim()}`,
    `Context: ${input.contextLine}`,
  ].filter((line): line is string => Boolean(line));
  return lines.join("\n");
}

export function appendMerchantAnswerKbBody(
  existingBody: string,
  sectionBody: string,
): string {
  const trimmedExisting = existingBody.trim();
  if (!trimmedExisting) return sectionBody;
  return `${trimmedExisting}\n\n---\n\n${sectionBody}`;
}

export function buildMerchantAnswerKbArticleContent(input: {
  question: string | null;
  answer: string;
  threadTag?: string | null;
  channelType: string;
  threadSummary?: string | null;
}): MerchantAnswerKbArticleContent {
  const topicTags = deriveMerchantAnswerTopicTags(input.question, input.answer);
  const contextLine = buildMerchantAnswerContextLine({
    channelType: input.channelType,
    threadSummary: input.threadSummary,
  });

  return {
    title: deriveMerchantAnswerKbTitle(input.question, input.answer),
    body: buildMerchantAnswerKbBody({
      question: input.question,
      answer: input.answer,
      contextLine,
    }),
    tags: buildMerchantAnswerKbTags(topicTags),
  };
}

export function pickSimilarAgentLearnedArticle<T extends { id: string; title: string; tags: string[] }>(
  candidates: readonly T[],
  targetTitle: string,
  topicTags: readonly string[],
): T | null {
  if (candidates.length === 0) return null;

  const normalizedTitle = targetTitle.trim().toLowerCase();
  const exact = candidates.find((article) => article.title.trim().toLowerCase() === normalizedTitle);
  if (exact) return exact;

  const topicSet = new Set(topicTags.map((tag) => tag.toLowerCase()));
  return candidates.find((article) => (
    article.tags.some((tag) => topicSet.has(tag.toLowerCase()))
  )) ?? null;
}

export async function resolveKnowledgeBaseIdByName(
  organizationId: string,
  name: string,
): Promise<string> {
  if (name.trim().toLowerCase() === NOTES_KB_FOLDER.toLowerCase()) {
    const notes = await getOrCreateNotesKnowledgeBase(organizationId);
    return notes.id;
  }

  const existing = await db.knowledgeBase.findFirst({
    where: {
      organizationId,
      source: "user",
      name: { equals: name, mode: "insensitive" },
    },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await db.knowledgeBase.create({
    data: { organizationId, name, source: "user" },
    select: { id: true },
  });
  return created.id;
}

export async function resolveUserKnowledgeBaseId(organizationId: string): Promise<string> {
  const notesKb = await db.knowledgeBase.findFirst({
    where: {
      organizationId,
      source: "user",
      name: { equals: NOTES_KB_FOLDER, mode: "insensitive" },
    },
    select: { id: true },
  });
  if (notesKb) return notesKb.id;

  const legacy = await db.knowledgeBase.findFirst({
    where: { organizationId, source: "user" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (legacy) return legacy.id;

  return resolveKnowledgeBaseIdByName(organizationId, NOTES_KB_FOLDER);
}

export async function saveMerchantAnswerToKb(
  input: SaveMerchantAnswerToKbInput,
): Promise<SaveMerchantAnswerToKbResult> {
  const content = buildMerchantAnswerKbArticleContent(input);
  const topicTags = deriveMerchantAnswerTopicTags(input.question, input.answer);
  const folderName = resolveTopicFolderName(topicTags);
  const knowledgeBaseId = await resolveKnowledgeBaseIdByName(input.organizationId, folderName);

  const candidates = await db.kbArticle.findMany({
    where: {
      organizationId: input.organizationId,
      tags: { has: AGENT_LEARNED_KB_TAG },
      OR: [
        { title: { equals: content.title, mode: "insensitive" } },
        ...topicTags.map((tag) => ({ tags: { has: tag } })),
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: 5,
    select: { id: true, title: true, body: true, tags: true },
  });

  const existing = pickSimilarAgentLearnedArticle(candidates, content.title, topicTags);

  if (existing) {
    const mergedTags = [...new Set([...existing.tags, ...content.tags])];
    const updated = await db.kbArticle.update({
      where: { id: existing.id },
      data: {
        title: content.title,
        body: appendMerchantAnswerKbBody(existing.body, content.body),
        tags: mergedTags,
      },
      select: { id: true, title: true, body: true },
    });

    await db.kbCitation.create({
      data: {
        organizationId: input.organizationId,
        kbArticleId: updated.id,
        threadId: input.threadId,
      },
    });

    return {
      articleId: updated.id,
      title: updated.title,
      body: updated.body,
      created: false,
      updated: true,
    };
  }

  const created = await db.kbArticle.create({
    data: {
      organizationId: input.organizationId,
      knowledgeBaseId,
      title: content.title.slice(0, 255),
      body: content.body,
      tags: content.tags,
    },
    select: { id: true, title: true, body: true },
  });

  await db.kbCitation.create({
    data: {
      organizationId: input.organizationId,
      kbArticleId: created.id,
      threadId: input.threadId,
    },
  });

  return {
    articleId: created.id,
    title: created.title,
    body: created.body,
    created: true,
    updated: false,
  };
}

const STORE_FACT_TAG_PREFIX = "store-fact:";

function storeFactTag(name: MerchantAnswerName): string {
  return `${STORE_FACT_TAG_PREFIX}${name}`;
}

/**
 * A blank's answer, kept as one Memory entry: the card's question as its title
 * and the merchant's answer as its body, so the merchant sees and corrects it
 * where they see everything else the agent learned. A new answer replaces the
 * entry, and replaces an untyped learned note saved under the same question
 * before answers were kept this way, so two answers never disagree.
 */
export async function saveStoreFact(input: {
  organizationId: string;
  name: MerchantAnswerName;
  answer: string;
}): Promise<void> {
  const question = merchantAnswerQuestion(input.name);
  const knowledgeBaseId = await resolveKnowledgeBaseIdByName(input.organizationId, LEARNED_KB_FOLDER);
  await db.$transaction(async (tx) => {
    await tx.kbArticle.deleteMany({
      where: {
        organizationId: input.organizationId,
        OR: [
          { tags: { has: storeFactTag(input.name) } },
          { title: question, tags: { has: AGENT_LEARNED_KB_TAG } },
        ],
      },
    });
    await tx.kbArticle.create({
      data: {
        organizationId: input.organizationId,
        knowledgeBaseId,
        title: question,
        body: input.answer,
        tags: [AGENT_LEARNED_KB_TAG, storeFactTag(input.name)],
      },
    });
  });
}

/**
 * The store's saved blank answers. A correction the merchant made in Memory
 * replaces its entry's answer. An answer that cannot go in front of a customer
 * as written is not an answer, so its blank is asked again.
 */
export async function readStoreFacts(organizationId: string): Promise<MerchantAnswers> {
  const [facts, corrections] = await Promise.all([
    db.kbArticle.findMany({
      where: { organizationId, tags: { hasSome: MERCHANT_ANSWER_NAMES.map(storeFactTag) } },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      select: { id: true, body: true, tags: true },
    }),
    db.kbArticle.findMany({
      where: { organizationId, tags: { has: MEMORY_OVERRIDE_TAG } },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      select: { body: true, tags: true },
    }),
  ]);
  const answers: MerchantAnswers = {};
  for (const name of MERCHANT_ANSWER_NAMES) {
    const fact = facts.find((article) => article.tags.includes(storeFactTag(name)));
    if (!fact) continue;
    const correction = corrections.find((article) => memoryOverrideTargetId(article.tags) === fact.id);
    const answer = readBlankAnswer(correction ? correction.body : fact.body);
    if (answer) answers[name] = answer;
  }
  return answers;
}

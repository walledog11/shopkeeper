import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChannelType, db } from "@shopkeeper/db";
import {
  cleanupTestData,
  createTestCustomer,
  createTestMessage,
  createTestOrg,
  createTestThread,
} from "@shopkeeper/db/test-helpers";

const { getSpy } = vi.hoisted(() => ({ getSpy: vi.fn() }));

vi.mock("@vercel/blob", () => ({ get: getSpy }));
vi.mock("./logger.js", () => ({
  default: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

import { buildContext, type ThreadSink } from "./context.js";
import { CONTEXT_BUDGETS } from "./context-budget.js";

const orgIds: string[] = [];
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01]);

const sink: ThreadSink = {
  escalateToHuman: async () => ({ status: "ok", message: "ok" }),
  askOperator: async () => ({ status: "ok", message: "ok" }),
  addInternalNote: async () => ({ status: "ok", message: "ok" }),
  sendReply: async () => ({ status: "ok", message: "ok" }),
  sendEmail: async () => ({ status: "ok", message: "ok" }),
  updateThreadStatus: async () => ({ status: "ok", message: "ok" }),
  updateThreadTag: async () => ({ status: "ok", message: "ok" }),
};

beforeEach(() => {
  getSpy.mockReset();
});

afterEach(async () => {
  await Promise.all(orgIds.splice(0).map((orgId) => cleanupTestData(orgId)));
});

describe("buildContext Instagram images", () => {
  it("carries a stored Instagram attachment into recent agent-message context", async () => {
    const org = await createTestOrg();
    orgIds.push(org.id);
    const customer = await createTestCustomer(org.id, `ig_${randomUUID()}`);
    const thread = await createTestThread(org.id, customer.id, ChannelType.ig_dm);
    const message = await createTestMessage(thread.id, "[Instagram image attachment]");
    const reference = `blob:attachments/${org.id}/image-id/instagram-image.png`;
    await db.message.update({
      where: { id: message.id },
      data: { attachments: [reference] },
    });
    getSpy.mockResolvedValueOnce({
      statusCode: 200,
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue(PNG);
          controller.close();
        },
      }),
      blob: { contentType: "image/png", size: PNG.byteLength },
    });

    const context = await buildContext(thread.id, org.id, sink);

    expect(context.recentMessages).toEqual([{
      senderType: "customer",
      contentText: "[Instagram image attachment]",
      attachments: [{
        type: "image",
        reference,
        status: "available",
        mediaType: "image/png",
        data: PNG.toString("base64"),
      }],
    }]);
  });

  it("does not hydrate private attachments for non-Instagram threads", async () => {
    const org = await createTestOrg();
    orgIds.push(org.id);
    const customer = await createTestCustomer(org.id, `${randomUUID()}@example.com`);
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);
    const message = await createTestMessage(thread.id, "See attachment");
    await db.message.update({
      where: { id: message.id },
      data: { attachments: [`blob:attachments/${org.id}/image-id/photo.png`] },
    });

    const context = await buildContext(thread.id, org.id, sink);

    expect(context.recentMessages).toEqual([{
      senderType: "customer",
      contentText: "See attachment",
    }]);
    expect(getSpy).not.toHaveBeenCalled();
  });

  it("enforces bounded recent-message, summary, and KB context", async () => {
    const org = await createTestOrg();
    orgIds.push(org.id);
    const customer = await createTestCustomer(org.id, `${randomUUID()}@example.com`);
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);
    await db.thread.update({
      where: { id: thread.id },
      data: { aiSummary: "summary ".repeat(500) },
    });
    await db.message.createMany({
      data: Array.from({ length: 25 }, (_, index) => ({
        organizationId: org.id,
        threadId: thread.id,
        senderType: index % 2 === 0 ? "customer" as const : "agent" as const,
        contentText: `message-${index}-${"x".repeat(2_000)}`,
        sentAt: new Date(Date.UTC(2026, 0, 1, 0, index)),
      })),
    });
    const knowledgeBase = await db.knowledgeBase.create({
      data: { organizationId: org.id, name: "Budget KB" },
    });
    await db.kbArticle.createMany({
      data: Array.from({ length: 4 }, (_, index) => ({
        organizationId: org.id,
        knowledgeBaseId: knowledgeBase.id,
        title: `Article ${index}`,
        body: "policy ".repeat(2_000),
        updatedAt: new Date(Date.UTC(2026, 0, 1, 0, index)),
      })),
    });

    const context = await buildContext(thread.id, org.id, sink, {
      contextBudgetMode: "enforce",
    });

    expect(context.recentMessages.length).toBeLessThanOrEqual(CONTEXT_BUDGETS.recentMessageCount);
    expect(context.recentMessages.length).toBeGreaterThan(0);
    expect(context.recentMessages.at(-1)?.contentText).toContain("message-24-");
    expect(context.recentMessages.reduce(
      (sum, message) => sum + (message.contentText?.length ?? 0),
      0,
    )).toBeLessThanOrEqual(CONTEXT_BUDGETS.recentMessageChars);
    expect(context.thread.aiSummary?.length).toBeLessThanOrEqual(CONTEXT_BUDGETS.priorSummaryChars);
    expect(context.kbArticles).toHaveLength(CONTEXT_BUDGETS.kbArticleCount);
    expect(context.kbArticles.reduce(
      (sum, article) => sum + article.title.length + article.body.length,
      0,
    )).toBeLessThanOrEqual(CONTEXT_BUDGETS.kbTotalChars);
  });
});

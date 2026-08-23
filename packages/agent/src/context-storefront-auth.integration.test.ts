import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChannelType, db } from "@shopkeeper/db";
import {
  cleanupTestData,
  createTestCustomer,
  createTestIntegration,
  createTestMessage,
  createTestOrg,
  createTestThread,
} from "@shopkeeper/db/test-helpers";
import { buildContext, type ThreadSink } from "./context.js";
import { decideAutonomy } from "./autonomy.js";
import { planAgent } from "./planner.js";
import { hashVerificationCode } from "./storefront-verification.js";

const { mockAnthropicCreate } = vi.hoisted(() => ({ mockAnthropicCreate: vi.fn() }));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class Anthropic {
    messages = { create: mockAnthropicCreate };
  },
}));

const orgIds: string[] = [];

const sink: ThreadSink = {
  escalateToHuman: async () => ({ status: "ok", message: "ok" }),
  askOperator: async () => ({ status: "ok", message: "ok" }),
  addInternalNote: async () => ({ status: "ok", message: "ok" }),
  sendReply: async () => ({ status: "ok", message: "ok" }),
  sendEmail: async () => ({ status: "ok", message: "ok" }),
  updateThreadStatus: async () => ({ status: "ok", message: "ok" }),
  updateThreadTag: async () => ({ status: "ok", message: "ok" }),
};

afterEach(async () => {
  mockAnthropicCreate.mockReset();
  await Promise.all(orgIds.splice(0).map((orgId) => cleanupTestData(orgId)));
});

async function storefrontThread(channelType: ChannelType = ChannelType.shopify_chat) {
  const org = await createTestOrg();
  orgIds.push(org.id);
  const integration = await createTestIntegration(org.id, {
    platform: ChannelType.shopify,
    externalAccountId: `ctx-${randomUUID()}.myshopify.com`,
    accessToken: "shpat_test",
  });
  const customer = await createTestCustomer(org.id, `shopify_chat:${randomUUID()}`);
  const thread = await createTestThread(org.id, customer.id, channelType);
  await createTestMessage(thread.id, "hi");
  const session = await db.storefrontChatSession.create({
    data: {
      organizationId: org.id,
      integrationId: integration.id,
      customerId: customer.id,
      threadId: thread.id,
      storefrontHost: integration.externalAccountId,
      resumeSecretHash: "x".repeat(64),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  // Inbound writes this row in the same transaction that opens the episode, and
  // verification resolves through it rather than through session.threadId.
  await db.storefrontChatSessionEpisode.create({
    data: { organizationId: org.id, sessionId: session.id, threadId: thread.id },
  });
  return { org, integration, customer, thread, session };
}

// A second episode on the same browser session, as an inbound rollover would
// leave it: the session pointer moves, both episodes stay in its history.
async function rollToNewEpisode(
  orgId: string,
  sessionId: string,
  customerId: string,
  expiredThreadId: string,
) {
  await db.thread.update({
    where: { id: expiredThreadId },
    data: { status: "closed", closedReason: "episode_rollover" },
  });
  const next = await createTestThread(orgId, customerId, ChannelType.shopify_chat);
  await db.storefrontChatSessionEpisode.updateMany({
    where: { sessionId, threadId: expiredThreadId },
    data: { endedAt: new Date() },
  });
  await db.storefrontChatSessionEpisode.create({
    data: { organizationId: orgId, sessionId, threadId: next.id },
  });
  await db.storefrontChatSession.update({
    where: { id: sessionId },
    data: { threadId: next.id },
  });
  return next;
}

async function addVerification(
  orgId: string,
  sessionId: string,
  orderName: string,
  orderId: string,
  verified: boolean,
) {
  await db.storefrontChatVerification.create({
    data: {
      organizationId: orgId,
      sessionId,
      orderName,
      orderId,
      codeHash: hashVerificationCode("123456"),
      expiresAt: new Date(Date.now() + 60_000),
      ...(verified ? { verifiedAt: new Date() } : {}),
    },
  });
}

describe("storefront auth state in buildContext", () => {
  it("is guest while no challenge has been answered", async () => {
    const { org, thread } = await storefrontThread();

    const ctx = await buildContext(thread.id, org.id, sink);

    expect(ctx!.authState).toBe("guest");
    expect(ctx!.verifiedOrders).toBeUndefined();
  });

  // An outstanding challenge is not a verified one. If this ever flipped, asking
  // for a code would be enough to read the order.
  it("stays guest while a challenge is outstanding but unanswered", async () => {
    const { org, thread, session } = await storefrontThread();
    await addVerification(org.id, session.id, "#1025", "5678901234", false);

    const ctx = await buildContext(thread.id, org.id, sink);

    expect(ctx!.authState).toBe("guest");
  });

  it("promotes to verified once a code has been accepted, carrying that order", async () => {
    const { org, thread, session } = await storefrontThread();
    await addVerification(org.id, session.id, "#1025", "5678901234", true);

    const ctx = await buildContext(thread.id, org.id, sink);

    expect(ctx!.authState).toBe("verified");
    expect(ctx!.verifiedOrders).toEqual([{ orderName: "#1025", orderId: "5678901234" }]);
  });

  it("carries only the verified orders when a session holds both kinds", async () => {
    const { org, thread, session } = await storefrontThread();
    await addVerification(org.id, session.id, "#1025", "5678901234", true);
    await addVerification(org.id, session.id, "#1026", "9999999999", false);

    const ctx = await buildContext(thread.id, org.id, sink);

    expect(ctx!.verifiedOrders).toEqual([{ orderName: "#1025", orderId: "5678901234" }]);
  });

  it("drops back to guest when the session is revoked", async () => {
    const { org, thread, session } = await storefrontThread();
    await addVerification(org.id, session.id, "#1025", "5678901234", true);
    await db.storefrontChatSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });

    const ctx = await buildContext(thread.id, org.id, sink);

    expect(ctx!.authState).toBe("guest");
  });

  // Verification scope must not move with the session's thread pointer. Both
  // directions matter, and they fail differently: inheriting silently would hand
  // a new conversation someone else's proof, while losing it silently would make
  // a late merchant reply on the expired thread run under guest policy.
  describe("across an episode boundary", () => {
    it("keeps the new episode verified on a verified session", async () => {
      const { org, customer, thread, session } = await storefrontThread();
      await addVerification(org.id, session.id, "#1025", "5678901234", true);

      const next = await rollToNewEpisode(org.id, session.id, customer.id, thread.id);
      const ctx = await buildContext(next.id, org.id, sink);

      expect(ctx.authState).toBe("verified");
      expect(ctx.verifiedOrders).toEqual([{ orderName: "#1025", orderId: "5678901234" }]);
    });

    it("keeps the expired episode verified too", async () => {
      const { org, customer, thread, session } = await storefrontThread();
      await addVerification(org.id, session.id, "#1025", "5678901234", true);

      await rollToNewEpisode(org.id, session.id, customer.id, thread.id);
      const ctx = await buildContext(thread.id, org.id, sink);

      expect(ctx.authState).toBe("verified");
    });

    it("still drops both episodes to guest when the session is revoked", async () => {
      const { org, customer, thread, session } = await storefrontThread();
      await addVerification(org.id, session.id, "#1025", "5678901234", true);
      const next = await rollToNewEpisode(org.id, session.id, customer.id, thread.id);
      await db.storefrontChatSession.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });

      expect((await buildContext(next.id, org.id, sink)).authState).toBe("guest");
      expect((await buildContext(thread.id, org.id, sink)).authState).toBe("guest");
    });

    it("gives another visitor's episode nothing", async () => {
      const { org, session } = await storefrontThread();
      await addVerification(org.id, session.id, "#1025", "5678901234", true);

      // Same org, a different browser. One shopper proving control of an order
      // must not verify anyone else's conversation. (A second *open* thread for
      // the same customer is impossible by construction —
      // threads_one_open_per_customer — so a different visitor is also the only
      // shape this can take.)
      const other = await createTestCustomer(org.id, `shopify_chat:${randomUUID()}`);
      const stranger = await createTestThread(org.id, other.id, ChannelType.shopify_chat);
      const ctx = await buildContext(stranger.id, org.id, sink);

      expect(ctx.authState).toBe("guest");
    });
  });

  it("leaves every other channel with no auth state at all", async () => {
    const { org, thread } = await storefrontThread(ChannelType.email);

    const ctx = await buildContext(thread.id, org.id, sink);

    expect(ctx!.authState).toBeUndefined();
    expect(ctx!.verifiedOrders).toBeUndefined();
  });
});

describe("recent-orders prefetch safety", () => {
  it("classifies a reply plan as needs_review when the Shopify prefetch failed", async () => {
    const org = await createTestOrg();
    orgIds.push(org.id);
    await createTestIntegration(org.id, {
      platform: ChannelType.shopify,
      externalAccountId: `ctx-${randomUUID()}.myshopify.com`,
      accessToken: "shpat_test",
    });
    const customer = await createTestCustomer(org.id, `${randomUUID()}@example.com`, { name: "Jane" });
    const thread = await createTestThread(org.id, customer.id, ChannelType.email, {
      shopifyCustomerId: "123456789",
    });
    await createTestMessage(thread.id, "Where is my order?");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Shopify unavailable"));
    mockAnthropicCreate.mockResolvedValue({
      stop_reason: "tool_use",
      content: [{
        type: "tool_use",
        id: "send_1",
        name: "send_reply",
        input: { text: "I couldn't find any orders on your account." },
      }],
      usage: { input_tokens: 10, output_tokens: 5 },
    });

    try {
      const ctx = await buildContext(thread.id, org.id, sink);
      const plan = await planAgent(ctx, "Handle this customer's latest request");

      expect(fetchSpy).toHaveBeenCalled();
      expect(decideAutonomy(plan).kind).toBe("needs_review");
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

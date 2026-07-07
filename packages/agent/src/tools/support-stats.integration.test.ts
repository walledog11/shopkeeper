import { afterEach, describe, expect, it } from "vitest";
// Database-backed integration coverage for the production SQL in this package.
import { ChannelType, SenderType, db } from "@shopkeeper/db";
import {
  cleanupTestData,
  createTestCustomer,
  createTestOrg,
} from "@shopkeeper/db/test-helpers";
import { getSupportStats } from "./support-stats.js";

const orgIds: string[] = [];

afterEach(async () => {
  await Promise.all(orgIds.splice(0).map((orgId) => cleanupTestData(orgId)));
});

describe("getSupportStats", () => {
  it("isolates organizations and excludes non-inbox, filtered, archived, and deleted data", async () => {
    const org = await createTestOrg();
    const otherOrg = await createTestOrg();
    orgIds.push(org.id, otherOrg.id);
    const customer = await createTestCustomer(org.id, "stats@example.com");
    const otherCustomer = await createTestCustomer(otherOrg.id, "other-stats@example.com");
    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 2 * 86_400_000);
    const tenDaysAgo = new Date(now.getTime() - 10 * 86_400_000);

    const emailThread = await db.thread.create({
      data: {
        organizationId: org.id,
        customerId: customer.id,
        channelType: ChannelType.email,
        status: "closed",
        tag: "Shipping",
        createdAt: twoDaysAgo,
        updatedAt: new Date(twoDaysAgo.getTime() + 60 * 60_000),
        lastMessageAt: twoDaysAgo,
      },
    });
    const instagramThread = await db.thread.create({
      data: {
        organizationId: org.id,
        customerId: customer.id,
        channelType: ChannelType.ig_dm,
        status: "closed",
        tag: null,
        createdAt: now,
        updatedAt: new Date(now.getTime() + 120 * 60_000),
        lastMessageAt: now,
      },
    });
    await db.thread.create({
      data: {
        organizationId: org.id,
        customerId: customer.id,
        channelType: ChannelType.email,
        tag: "Shipping",
        createdAt: tenDaysAgo,
        updatedAt: tenDaysAgo,
        lastMessageAt: tenDaysAgo,
      },
    });

    const excludedThreads = [
      { channelType: ChannelType.email, archivedAt: now },
      { channelType: ChannelType.email, deletedAt: now },
      { channelType: ChannelType.email, filterStatus: "filtered" as const },
      { channelType: ChannelType.sms_agent },
      { channelType: ChannelType.dashboard_agent },
    ];
    for (const [index, excluded] of excludedThreads.entries()) {
      const excludedCustomer = await createTestCustomer(
        org.id,
        `excluded-${index}@example.com`,
      );
      await db.thread.create({
        data: {
          organizationId: org.id,
          customerId: excludedCustomer.id,
          status: "open",
          tag: "Excluded",
          createdAt: now,
          updatedAt: now,
          lastMessageAt: now,
          ...excluded,
        },
      });
    }
    await db.thread.create({
      data: {
        organizationId: otherOrg.id,
        customerId: otherCustomer.id,
        channelType: ChannelType.email,
        tag: "Other organization",
        createdAt: now,
        updatedAt: now,
        lastMessageAt: now,
      },
    });

    await db.message.createMany({
      data: [
        {
          threadId: emailThread.id,
          organizationId: org.id,
          senderType: SenderType.customer,
          contentText: "Where is my order?",
          sentAt: twoDaysAgo,
        },
        {
          threadId: emailThread.id,
          organizationId: org.id,
          senderType: SenderType.agent,
          contentText: "It shipped.",
          sentAt: twoDaysAgo,
        },
        {
          threadId: instagramThread.id,
          organizationId: org.id,
          senderType: SenderType.ai,
          contentText: "Draft",
          sentAt: now,
        },
        {
          threadId: emailThread.id,
          organizationId: org.id,
          senderType: SenderType.customer,
          contentText: "Deleted",
          sentAt: twoDaysAgo,
          deletedAt: now,
        },
        {
          threadId: emailThread.id,
          organizationId: org.id,
          senderType: SenderType.customer,
          contentText: "Outside window",
          sentAt: tenDaysAgo,
        },
      ],
    });

    const stats = await getSupportStats(org.id, 7);
    const afterQuery = Date.now();

    expect(new Date(stats.to).getTime()).toBeGreaterThanOrEqual(now.getTime());
    expect(new Date(stats.from).getTime()).toBeLessThanOrEqual(afterQuery - 7 * 86_400_000);
    expect(stats.tickets).toMatchObject({
      total: 2,
      byTag: expect.arrayContaining([
        { tag: "Shipping", count: 1 },
        { tag: "General", count: 1 },
      ]),
      byChannel: expect.arrayContaining([
        { channel: "email", count: 1 },
        { channel: "ig_dm", count: 1 },
      ]),
      byDay: expect.arrayContaining([
        { day: twoDaysAgo.toISOString().slice(0, 10), count: 1 },
        { day: now.toISOString().slice(0, 10), count: 1 },
      ]),
    });
    expect(stats.messages).toEqual({ customer: 1, agent: 1, ai: 1 });
    expect(stats.resolution).toEqual({ closedCount: 2, avgMinutes: 90 });

    const expanded = await getSupportStats(org.id, 30);
    expect(expanded.tickets.total).toBe(3);
    expect(expanded.tickets.byTag).toContainEqual({ tag: "Shipping", count: 2 });
  });
});

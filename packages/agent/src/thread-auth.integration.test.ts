import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  cleanupTestData,
  createTestCustomer,
  createTestMessage,
  createTestOrg,
  createTestThread,
} from "@shopkeeper/db/test-helpers";
import {
  getLatestConversationMessage,
  getLatestCustomerMessageText,
} from "./thread-auth.js";

const orgIds: string[] = [];

afterEach(async () => {
  await Promise.all(orgIds.splice(0).map((orgId) => cleanupTestData(orgId)));
});

async function seedThread(content: string) {
  const org = await createTestOrg();
  orgIds.push(org.id);
  const customer = await createTestCustomer(org.id, `${randomUUID()}@test.com`);
  const thread = await createTestThread(org.id, customer.id, "email");
  const message = await createTestMessage(thread.id, content);
  return { org, thread, message };
}

describe("tenant-scoped thread message reads", () => {
  it("returns the latest conversation message only for the owning organization", async () => {
    const owner = await seedThread("Owner request");
    const other = await seedThread("Other tenant request");

    await expect(
      getLatestConversationMessage(owner.thread.id, owner.org.id),
    ).resolves.toEqual({ id: owner.message.id, senderType: "customer" });
    await expect(
      getLatestConversationMessage(owner.thread.id, other.org.id),
    ).resolves.toBeNull();
  });

  it("returns customer message text only for the owning organization", async () => {
    const owner = await seedThread("  Owner request  ");
    const other = await seedThread("Other tenant request");

    await expect(
      getLatestCustomerMessageText(owner.thread.id, owner.org.id),
    ).resolves.toBe("Owner request");
    await expect(
      getLatestCustomerMessageText(owner.thread.id, other.org.id),
    ).resolves.toBeNull();
  });
});

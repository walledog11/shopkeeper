import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChannelType, SenderType } from "@shopkeeper/db";
import {
  cleanupTestData,
  createTestCustomer,
  createTestMessage,
  createTestOrg,
  createTestThread,
} from "@shopkeeper/db/test-helpers";

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
}));

import { auth } from "@clerk/nextjs/server";
import { GET } from "./route";

let org!: Awaited<ReturnType<typeof createTestOrg>>;

beforeEach(async () => {
  org = await createTestOrg();
  vi.mocked(auth).mockResolvedValue({
    userId: "usr_test",
    orgId: org.clerkOrgId,
  } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
});

afterEach(async () => {
  await cleanupTestData(org?.id);
  vi.clearAllMocks();
});

describe("GET /api/agent/sessions", () => {
  it("returns session metadata without transcripts", async () => {
    const customer = await createTestCustomer(org.id, "dashboard:usr_test");
    const thread = await createTestThread(org.id, customer.id, ChannelType.dashboard_agent);
    await createTestMessage(thread.id, "First user message");
    await createTestMessage(thread.id, "Agent reply", SenderType.agent);

    const res = await GET();
    const body = await res.json() as Array<{ id: string; preview: string; messages?: unknown }>;

    expect(res.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0]?.id).toBe(thread.id);
    expect(body[0]?.preview).toContain("First user message");
    expect(body[0]?.messages).toBeUndefined();
  });
});

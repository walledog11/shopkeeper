import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChannelType, SenderType } from "@clerk/db";
import {
  cleanupTestData,
  createTestCustomer,
  createTestMessage,
  createTestOrg,
  createTestThread,
} from "@clerk/db/test-helpers";

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
}));

import { auth } from "@clerk/nextjs/server";
import { GET } from "./route";

let org: Awaited<ReturnType<typeof createTestOrg>>;

beforeEach(async () => {
  org = await createTestOrg();
  vi.mocked(auth).mockResolvedValue({
    userId: "usr_test",
    orgId: org.clerkOrgId,
  } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
});

afterEach(async () => {
  if (org) {
    await cleanupTestData(org.id);
  }
  vi.clearAllMocks();
});

describe("GET /api/agent/sessions/[id]", () => {
  it("returns the transcript for the authenticated users session", async () => {
    const customer = await createTestCustomer(org.id, "dashboard:usr_test");
    const thread = await createTestThread(org.id, customer.id, ChannelType.dashboard_agent);
    await createTestMessage(thread.id, "Question");
    await createTestMessage(thread.id, "Answer", SenderType.agent);

    const res = await GET(new Request(`http://localhost:3000/api/agent/sessions/${thread.id}`), {
      params: Promise.resolve({ id: thread.id }),
    });
    const body = await res.json() as { id: string; messages: Array<{ role: string; text: string }> };

    expect(res.status).toBe(200);
    expect(body.id).toBe(thread.id);
    expect(body.messages).toEqual([
      { role: "user", text: "Question" },
      { role: "agent", text: "Answer" },
    ]);
  });

  it("rejects access to another users session", async () => {
    const customer = await createTestCustomer(org.id, "dashboard:usr_other");
    const thread = await createTestThread(org.id, customer.id, ChannelType.dashboard_agent);

    const res = await GET(new Request(`http://localhost:3000/api/agent/sessions/${thread.id}`), {
      params: Promise.resolve({ id: thread.id }),
    });

    expect(res.status).toBe(404);
  });
});

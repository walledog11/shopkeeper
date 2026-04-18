import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChannelType, db } from "@clerk/db";
import {
  cleanupTestData,
  createTestCustomer,
  createTestOrg,
  createTestThread,
} from "@clerk/db/test-helpers";

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
}));

const { mockBuildContext, mockRunAgent } = vi.hoisted(() => ({
  mockBuildContext: vi.fn().mockResolvedValue({ messages: [] }),
  mockRunAgent: vi.fn().mockResolvedValue({
    summary: "Done",
    actionsPerformed: [],
  }),
}));

vi.mock("@/lib/agent/runner", () => ({
  buildContext: mockBuildContext,
  runAgent: mockRunAgent,
}));

vi.mock("@/lib/agent/settings", () => ({
  resolveAgentSettings: vi.fn().mockReturnValue({}),
}));

import { auth } from "@clerk/nextjs/server";
import { POST } from "./route";

let org: Awaited<ReturnType<typeof createTestOrg>>;

beforeEach(async () => {
  org = await createTestOrg();
  vi.mocked(auth).mockResolvedValue({
    userId: "usr_test",
    orgId: org.clerkOrgId,
  } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
});

afterEach(async () => {
  await cleanupTestData(org.id);
  vi.clearAllMocks();
});

describe("POST /api/agent/chat", () => {
  it("rejects dashboard sessions owned by another user", async () => {
    const otherCustomer = await createTestCustomer(org.id, "dashboard:usr_other");
    const otherSession = await createTestThread(org.id, otherCustomer.id, ChannelType.dashboard_agent);

    const req = new Request("http://localhost:3000/api/agent/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instruction: "Hello", sessionId: otherSession.id }),
    });

    const res = await POST(req);
    expect(res.status).toBe(404);
    expect(mockRunAgent).not.toHaveBeenCalled();
  });

  it("creates a new session for the authenticated user", async () => {
    const req = new Request("http://localhost:3000/api/agent/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instruction: "Help me" }),
    });

    const res = await POST(req);
    const body = await res.json() as { sessionId: string };

    expect(res.status).toBe(200);
    expect(body.sessionId).toBeTruthy();

    const thread = await db.thread.findUnique({ where: { id: body.sessionId } });
    expect(thread?.channelType).toBe("dashboard_agent");
  });
});

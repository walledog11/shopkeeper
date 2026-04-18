import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanupTestData, createTestOrg } from "@clerk/db/test-helpers";
import { BadRequestError } from "@/lib/api-errors";

const { mockExecuteAgentTurn, mockResolveInternalAgentThread } = vi.hoisted(() => ({
  mockExecuteAgentTurn: vi.fn().mockResolvedValue({
    summary: "Done",
    actionsPerformed: [],
  }),
  mockResolveInternalAgentThread: vi.fn().mockResolvedValue({ id: "thread_internal" }),
}));

vi.mock("@/lib/agent/api/execution", () => ({
  executeAgentTurn: mockExecuteAgentTurn,
}));

vi.mock("@/lib/agent/api/internal", () => ({
  resolveInternalAgentThread: mockResolveInternalAgentThread,
}));

import { POST } from "./route";

let org: Awaited<ReturnType<typeof createTestOrg>>;

beforeEach(async () => {
  org = await createTestOrg();
  process.env.INTERNAL_API_SECRET = "test-secret";
});

afterEach(async () => {
  if (org?.id) {
    await cleanupTestData(org.id);
  }
  delete process.env.INTERNAL_API_SECRET;
  delete process.env.INTERNAL_API_SECRET_PREV;
  vi.clearAllMocks();
});

describe("POST /api/agent/internal", () => {
  it("rejects ambiguous requests without a sender identity", async () => {
    mockResolveInternalAgentThread.mockRejectedValueOnce(new BadRequestError("Missing sender identity for internal agent request"));

    const req = new Request("http://localhost:3000/api/agent/internal", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": "test-secret",
      },
      body: JSON.stringify({ orgId: org.id, instruction: "Handle this request" }),
    });

    const res = await POST(req);
    const body = await res.json() as { error: string };

    expect(res.status).toBe(400);
    expect(body.error).toContain("sender identity");
    expect(mockExecuteAgentTurn).not.toHaveBeenCalled();
  });

  it("delegates thread resolution to the shared internal service", async () => {
    const req = new Request("http://localhost:3000/api/agent/internal", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": "test-secret",
      },
      body: JSON.stringify({
        orgId: org.id,
        instruction: "Handle this request",
        senderPhone: "+15551234567",
        orderNumber: "1234",
      }),
    });

    const res = await POST(req);
    const body = await res.json() as { threadId: string };

    expect(res.status).toBe(200);
    expect(body.threadId).toBe("thread_internal");
    expect(mockResolveInternalAgentThread).toHaveBeenCalledWith({
      orgId: org.id,
      threadId: undefined,
      orderNumber: "1234",
      senderPhone: "+15551234567",
    });
    expect(mockExecuteAgentTurn).toHaveBeenCalledWith({
      orgId: org.id,
      threadId: "thread_internal",
      instruction: "Handle this request",
      approvedToolCalls: undefined,
      persistAuditNote: true,
      auditMetadata: {
        senderPhone: "+15551234567",
        clerkUserId: undefined,
      },
    });
  });
});

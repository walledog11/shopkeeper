import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChannelType, SenderType, db } from "@shopkeeper/db";
import {
  cleanupTestData,
  createTestCustomer,
  createTestOrg,
  createTestThread,
} from "@shopkeeper/db/test-helpers";

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
}));

const { mockPostGatewayAgentRequest, mockListGatewayAgentRequests, mockRecordAgentRouteFailure } = vi.hoisted(() => ({
  mockPostGatewayAgentRequest: vi.fn(),
  mockListGatewayAgentRequests: vi.fn(),
  mockRecordAgentRouteFailure: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/agent/api/gateway-operator-turn", () => ({
  postGatewayAgentRequest: mockPostGatewayAgentRequest,
  listGatewayAgentRequests: mockListGatewayAgentRequests,
}));

vi.mock("@/lib/server/agent-failure-alerts", () => ({
  recordAgentRouteFailure: mockRecordAgentRouteFailure,
}));

import { memberOperatorKey } from "@shopkeeper/agent/internal-thread";
import { auth } from "@clerk/nextjs/server";
import { GET, POST } from "./route";

let org!: Awaited<ReturnType<typeof createTestOrg>>;

beforeEach(async () => {
  org = await createTestOrg();
  vi.mocked(auth).mockResolvedValue({
    userId: "usr_test",
    orgId: org.clerkOrgId,
  } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
  mockPostGatewayAgentRequest.mockResolvedValue({
    status: 202,
    payload: { requestId: "req_1", taskId: "task_1", status: "queued", statusUrl: "/api/agent/requests/req_1" },
  });
  mockListGatewayAgentRequests.mockResolvedValue({ status: 200, payload: { requests: [] } });
});

afterEach(async () => {
  await cleanupTestData(org?.id);
  vi.clearAllMocks();
});

describe("POST /api/agent/chat", () => {
  // No session to create or resolve: the gateway owns the thread, so the route
  // hands over identity and instruction and nothing else.
  it("accepts durable work on the gateway operator path", async () => {
    const res = await POST(jsonReq({ clientRequestId: "11111111-1111-4111-8111-111111111111", instruction: "Help me" }));
    const body = await res.json() as { requestId: string; status: string };

    expect(res.status).toBe(202);
    expect(body).toMatchObject({ requestId: "req_1", status: "queued" });
    expect(mockPostGatewayAgentRequest).toHaveBeenCalledWith({
      organizationId: org.id,
      clerkUserId: "usr_test",
      clientRequestId: "11111111-1111-4111-8111-111111111111",
      instruction: "Help me",
    });
  });

  it("requires the client request identity", async () => {
    const res = await POST(jsonReq({ instruction: "Refund 1234" }));
    expect(res.status).toBe(400);
    expect(mockPostGatewayAgentRequest).not.toHaveBeenCalled();
  });

  it("passes the gateway's spend-cap response through unchanged", async () => {
    mockPostGatewayAgentRequest.mockResolvedValueOnce({
      status: 429,
      payload: { error: "AI spend cap reached for today.", code: "spend_cap_reached", currentUsd: 25, capUsd: 25 },
    });

    const res = await POST(jsonReq({ clientRequestId: "11111111-1111-4111-8111-111111111111", instruction: "Summarize today's tickets" }));
    const body = await res.json() as { code?: string; currentUsd?: number; capUsd?: number };

    expect(res.status).toBe(429);
    expect(body).toMatchObject({ code: "spend_cap_reached", currentUsd: 25, capUsd: 25 });
    expect(mockRecordAgentRouteFailure).not.toHaveBeenCalled();
  });

  it("records a route failure when the gateway turn fails", async () => {
    mockPostGatewayAgentRequest.mockResolvedValueOnce({
      status: 500,
      payload: { error: "Internal Server Error" },
    });

    const res = await POST(jsonReq({ clientRequestId: "11111111-1111-4111-8111-111111111111", instruction: "Draft a response" }));

    expect(res.status).toBe(500);
    expect(mockRecordAgentRouteFailure).toHaveBeenCalledWith(expect.objectContaining({
      route: "/api/agent/chat",
      orgId: org.id,
      error: expect.any(Error),
    }), expect.objectContaining({
      getCounterClient: expect.any(Function),
      onError: expect.any(Function),
    }));
  });
});

describe("GET /api/agent/chat", () => {
  // Continuity is the reason to open the panel: it shows the conversation the
  // merchant has been having on their phone, not an empty composer.
  it("returns the member's durable operator thread, oldest first", async () => {
    const member = await db.orgMember.create({
      data: { organizationId: org.id, clerkUserId: "usr_test" },
    });
    const customer = await createTestCustomer(org.id, memberOperatorKey(member.id));
    const thread = await db.thread.create({
      data: {
        organizationId: org.id,
        customerId: customer.id,
        channelType: ChannelType.operator,
        status: "open",
        operatorKey: memberOperatorKey(member.id),
      },
    });
    // Explicit timestamps: the route reads the newest window and reverses it, so
    // ordering is the thing under test and must not depend on insert timing.
    await db.message.createMany({
      data: [
        {
          threadId: thread.id,
          organizationId: org.id,
          senderType: SenderType.customer,
          contentText: "refund 1234",
          sentAt: new Date("2026-08-06T10:00:00.000Z"),
        },
        {
          threadId: thread.id,
          organizationId: org.id,
          senderType: SenderType.agent,
          contentText: "Refunded $12 to Sarah.",
          sentAt: new Date("2026-08-06T10:00:01.000Z"),
        },
        // Agent-turn audit notes are plumbing, not conversation.
        {
          threadId: thread.id,
          organizationId: org.id,
          senderType: SenderType.note,
          contentText: "__shopkeeper_agent__{}",
          sentAt: new Date("2026-08-06T10:00:02.000Z"),
        },
      ],
    });

    const res = await GET(new Request("http://localhost:3000/api/agent/chat"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      messages: [
        { role: "user", text: "refund 1234" },
        { role: "agent", text: "Refunded $12 to Sarah." },
      ],
      requests: [],
    });
  });

  it("returns an empty transcript before the merchant has said anything", async () => {
    const res = await GET(new Request("http://localhost:3000/api/agent/chat"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ messages: [], requests: [] });
  });
});

function jsonReq(body: unknown) {
  return new Request("http://localhost:3000/api/agent/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

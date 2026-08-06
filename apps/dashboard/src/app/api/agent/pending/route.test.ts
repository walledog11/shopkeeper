import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChannelType, db } from "@shopkeeper/db";
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

const { mockPostGatewayPlanDecision, mockRecordAgentRouteFailure } = vi.hoisted(() => ({
  mockPostGatewayPlanDecision: vi.fn(),
  mockRecordAgentRouteFailure: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/agent/api/gateway-operator-turn", () => ({
  postGatewayPlanDecision: mockPostGatewayPlanDecision,
}));

vi.mock("@/lib/server/agent-failure-alerts", () => ({
  recordAgentRouteFailure: mockRecordAgentRouteFailure,
}));

import { memberOperatorKey } from "@shopkeeper/agent/internal-thread";
import { auth } from "@clerk/nextjs/server";
import { GET, POST } from "./route";

const PLAN_ONE = "2660b813-918a-497d-b633-edef698d4954";

let org!: Awaited<ReturnType<typeof createTestOrg>>;

beforeEach(async () => {
  org = await createTestOrg();
  vi.mocked(auth).mockResolvedValue({
    userId: "usr_test",
    orgId: org.clerkOrgId,
  } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
  mockPostGatewayPlanDecision.mockResolvedValue({
    status: 200,
    payload: { summary: "Plan dismissed." },
  });
});

afterEach(async () => {
  await cleanupTestData(org?.id);
  vi.clearAllMocks();
});

describe("GET /api/agent/pending", () => {
  it("returns the merchant's queued plans", async () => {
    const member = await db.orgMember.create({
      data: { organizationId: org.id, clerkUserId: "usr_test" },
    });
    const customer = await createTestCustomer(org.id, "sarah@example.com", { name: "Sarah Jones" });
    const thread = await createTestThread(org.id, customer.id, ChannelType.email);
    await db.operatorContext.create({
      data: {
        organizationId: org.id,
        memberKey: memberOperatorKey(member.id),
        pendingPlans: [{
          threadId: thread.id,
          planId: PLAN_ONE,
          instruction: "Refund the late order",
          customerName: "Sarah Jones",
          actionLabel: "reply to Sarah",
          rawToolCalls: [{ id: "tc1", name: "send_reply", input: { text: "Refunded." } }],
        }],
      },
    });

    const res = await GET(new Request("http://localhost:3000/api/agent/pending"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      plans: [{
        planId: PLAN_ONE,
        threadId: thread.id,
        customerName: "Sarah Jones",
        actionLabel: "reply to Sarah",
        instruction: "Refund the late order",
        steps: ["Notify customer"],
        draft: "Refunded.",
      }],
    });
  });

  it("returns an empty list before the merchant has a membership row", async () => {
    const res = await GET(new Request("http://localhost:3000/api/agent/pending"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ plans: [] });
  });
});

describe("POST /api/agent/pending", () => {
  it("forwards a button decision to the gateway", async () => {
    const res = await POST(jsonReq({ planId: PLAN_ONE, decision: "dismiss" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ summary: "Plan dismissed." });
    expect(mockPostGatewayPlanDecision).toHaveBeenCalledWith({
      organizationId: org.id,
      clerkUserId: "usr_test",
      planId: PLAN_ONE,
      decision: "dismiss",
    });
  });

  it("passes through a gateway 409 when the plan was already resolved", async () => {
    mockPostGatewayPlanDecision.mockResolvedValueOnce({
      status: 409,
      payload: { error: "That plan is no longer waiting on you." },
    });

    const res = await POST(jsonReq({ planId: PLAN_ONE, decision: "approve" }));

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "That plan is no longer waiting on you." });
    expect(mockRecordAgentRouteFailure).not.toHaveBeenCalled();
  });

  it("records a route failure when the gateway returns 5xx", async () => {
    mockPostGatewayPlanDecision.mockResolvedValueOnce({
      status: 500,
      payload: { error: "Internal Server Error" },
    });

    const res = await POST(jsonReq({ planId: PLAN_ONE, decision: "approve" }));

    expect(res.status).toBe(500);
    expect(mockRecordAgentRouteFailure).toHaveBeenCalledWith(expect.objectContaining({
      route: "/api/agent/pending",
      orgId: org.id,
      error: expect.any(Error),
    }), expect.objectContaining({
      getCounterClient: expect.any(Function),
      onError: expect.any(Function),
    }));
  });

  it("rejects a malformed decision", async () => {
    const res = await POST(jsonReq({ planId: PLAN_ONE, decision: "maybe" }));

    expect(res.status).toBe(400);
    expect(mockPostGatewayPlanDecision).not.toHaveBeenCalled();
  });
});

function jsonReq(body: unknown) {
  return new Request("http://localhost:3000/api/agent/pending", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

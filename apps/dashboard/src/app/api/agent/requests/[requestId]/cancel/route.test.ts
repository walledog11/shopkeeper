import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanupTestData, createTestOrg } from "@shopkeeper/db/test-helpers";

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
}));

const { mockPostGatewayAgentRequestCancel } = vi.hoisted(() => ({
  mockPostGatewayAgentRequestCancel: vi.fn(),
}));

vi.mock("@/lib/agent/api/gateway-operator-turn", () => ({
  postGatewayAgentRequestCancel: mockPostGatewayAgentRequestCancel,
}));

import { auth } from "@clerk/nextjs/server";
import { POST } from "./route";

let org!: Awaited<ReturnType<typeof createTestOrg>>;

beforeEach(async () => {
  org = await createTestOrg();
  vi.mocked(auth).mockResolvedValue({
    userId: "usr_test",
    orgId: org.clerkOrgId,
  } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
  mockPostGatewayAgentRequestCancel.mockResolvedValue({
    status: 200, payload: { requestId: "req_1", status: "cancelled" },
  });
});

afterEach(async () => {
  await cleanupTestData(org?.id);
  vi.clearAllMocks();
});

describe("POST /api/agent/requests/[requestId]/cancel", () => {
  it("forwards the stop with the revision the merchant was looking at", async () => {
    const res = await POST(cancelReq({ taskRevision: 2 }), { params: Promise.resolve({ requestId: "req_1" }) });

    expect(res.status).toBe(200);
    expect(mockPostGatewayAgentRequestCancel).toHaveBeenCalledWith({
      organizationId: org.id,
      clerkUserId: "usr_test",
      requestId: "req_1",
      taskRevision: 2,
    });
  });

  it("refuses a stop that names no revision", async () => {
    const res = await POST(cancelReq({}), { params: Promise.resolve({ requestId: "req_1" }) });

    expect(res.status).toBe(400);
    expect(mockPostGatewayAgentRequestCancel).not.toHaveBeenCalled();
  });
});

function cancelReq(body: unknown) {
  return new Request("http://localhost:3000/api/agent/requests/req_1/cancel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

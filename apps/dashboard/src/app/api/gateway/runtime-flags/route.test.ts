import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestOrg, cleanupTestData } from "@shopkeeper/db/test-helpers";

const { mockAuth, mockFetch } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockFetch: vi.fn(),
}));

vi.stubGlobal("fetch", mockFetch);

vi.mock("@clerk/nextjs/server", () => ({
  auth: mockAuth,
  clerkClient: vi.fn(),
}));

vi.mock("@/lib/server/gateway-url", () => ({
  getGatewayBaseUrl: vi.fn(() => "http://gateway.test"),
}));

import { GET } from "./route";

let org!: Awaited<ReturnType<typeof createTestOrg>>;

beforeEach(async () => {
  org = await createTestOrg();
  mockAuth.mockResolvedValue({ userId: "usr_runtime_flags", orgId: org.clerkOrgId });
  vi.stubEnv("INTERNAL_API_SECRET", "test-internal-secret");
  mockFetch.mockReset();
});

afterEach(async () => {
  await cleanupTestData(org?.id);
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("GET /api/gateway/runtime-flags", () => {
  it("proxies gateway monitor flag state for the active org", async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({
      monitors: {
        orderRisk: true,
        returnLifecycle: false,
        deliveryException: false,
      },
    }), { status: 200 }));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      monitors: {
        orderRisk: true,
        returnLifecycle: false,
        deliveryException: false,
      },
    });
    expect(mockFetch).toHaveBeenCalledWith(
      "http://gateway.test/internal/runtime-flags",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          "x-internal-secret": "test-internal-secret",
        }),
      }),
    );
  });

  it("returns 503 when INTERNAL_API_SECRET is unset", async () => {
    vi.stubEnv("INTERNAL_API_SECRET", "");
    const response = await GET();
    expect(response.status).toBe(503);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

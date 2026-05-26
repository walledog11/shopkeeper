import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
}));

const { mockListEntries, mockStreamCsv } = vi.hoisted(() => ({
  mockListEntries: vi.fn(),
  mockStreamCsv: vi.fn(),
}));

vi.mock("@/lib/server/org", () => ({
  getOrCreateOrg: vi.fn(),
}));

vi.mock("@/lib/agent/api/action-log", () => ({
  listAgentActionLogEntries: mockListEntries,
  streamAgentActionLogCsv: mockStreamCsv,
  decodeAgentActionCursor: (raw: string) => {
    if (raw === "valid") return { executedAt: "2026-04-21T12:00:00.000Z", turnId: "turn_1" };
    return null;
  },
}));

import { GET } from "./route";
import { auth } from "@clerk/nextjs/server";
import { getOrCreateOrg } from "@/lib/server/org";
import { UnauthorizedError } from "@/lib/api/errors";

describe("GET /api/agent/actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue({
      userId: "usr_test",
      orgId: "org_test",
    } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
    vi.mocked(getOrCreateOrg).mockResolvedValue({
      id: "org_db_1",
    } as Awaited<ReturnType<typeof getOrCreateOrg>>);
  });

  it("returns paginated structured agent actions", async () => {
    mockListEntries.mockResolvedValue({
      entries: [
        {
          id: "turn_1",
          sentAt: "2026-04-21T12:00:00.000Z",
          threadId: "thread_1",
          channelType: "email",
          threadTag: "Returns",
          customerHandle: "Taylor",
          instruction: "Refund the order",
          summary: "Issued the refund and closed the ticket.",
          actions: [{ tool: "create_refund", result: "Refunded $25.00." }],
          mode: "human_approved",
        },
      ],
      nextCursor: "cursor_2",
    });

    const res = await GET(new Request("http://localhost:3000/api/agent/actions"));
    expect(res.status).toBe(200);

    const body = await res.json() as { entries: unknown[]; nextCursor: string | null };
    expect(body.nextCursor).toBe("cursor_2");
    expect(body.entries).toHaveLength(1);
    expect(mockListEntries).toHaveBeenCalledWith({
      orgId: "org_db_1",
      cursor: null,
      filters: {
        channels: undefined,
        tools: undefined,
        errorsOnly: undefined,
        from: undefined,
        to: undefined,
      },
    });
    expect(mockStreamCsv).not.toHaveBeenCalled();
  });

  it("streams the action log as CSV when format=csv", async () => {
    const csv = "timestamp,customer\n2026-04-21T12:00:00.000Z,Taylor\n";
    mockStreamCsv.mockReturnValue(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(csv));
        controller.close();
      },
    }));

    const res = await GET(new Request("http://localhost:3000/api/agent/actions?format=csv"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toContain("agent-actions-");
    expect(await res.text()).toBe(csv);
    expect(mockStreamCsv).toHaveBeenCalledWith({
      orgId: "org_db_1",
      filters: {
        channels: undefined,
        tools: undefined,
        errorsOnly: undefined,
        from: undefined,
        to: undefined,
      },
    });
    expect(mockListEntries).not.toHaveBeenCalled();
  });

  it("returns 401 when there is no authenticated user", async () => {
    vi.mocked(auth).mockResolvedValue({
      userId: null,
      orgId: null,
    } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
    vi.mocked(getOrCreateOrg).mockRejectedValueOnce(new UnauthorizedError());

    const res = await GET(new Request("http://localhost:3000/api/agent/actions"));
    expect(res.status).toBe(401);
    expect(mockListEntries).not.toHaveBeenCalled();
  });
});

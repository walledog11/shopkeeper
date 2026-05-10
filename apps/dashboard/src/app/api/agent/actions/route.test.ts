import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
}));

const { mockListEntries, mockListAllEntries, mockSerializeCsv } = vi.hoisted(() => ({
  mockListEntries: vi.fn(),
  mockListAllEntries: vi.fn(),
  mockSerializeCsv: vi.fn(),
}));

vi.mock("@/lib/server/org", () => ({
  getOrCreateOrg: vi.fn(),
}));

vi.mock("@/lib/agent/api/action-log", () => ({
  listAgentActionLogEntries: mockListEntries,
  listAllAgentActionLogEntries: mockListAllEntries,
  serializeAgentActionLogCsv: mockSerializeCsv,
}));

import { GET } from "./route";
import { auth } from "@clerk/nextjs/server";
import { getOrCreateOrg } from "@/lib/server/org";

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
          id: "msg_1",
          sentAt: "2026-04-21T12:00:00.000Z",
          threadId: "thread_1",
          channelType: "email",
          threadTag: "Returns",
          customerHandle: "Taylor",
          instruction: "Refund the order",
          summary: "Issued the refund and closed the ticket.",
          actions: [{ tool: "create_refund", result: "Refunded $25.00." }],
        },
      ],
      nextCursor: "cursor_2",
    });

    const res = await GET(new Request("http://localhost:3000/api/agent/actions"));
    expect(res.status).toBe(200);

    const body = await res.json() as { entries: unknown[]; nextCursor: string | null };
    expect(body).toEqual({
      entries: [
        {
          id: "msg_1",
          sentAt: "2026-04-21T12:00:00.000Z",
          threadId: "thread_1",
          channelType: "email",
          threadTag: "Returns",
          customerHandle: "Taylor",
          instruction: "Refund the order",
          summary: "Issued the refund and closed the ticket.",
          actions: [{ tool: "create_refund", result: "Refunded $25.00." }],
        },
      ],
      nextCursor: "cursor_2",
    });
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
    expect(mockListAllEntries).not.toHaveBeenCalled();
  });

  it("exports the full structured action log as CSV", async () => {
    mockListAllEntries.mockResolvedValue([
      {
        id: "msg_1",
        sentAt: "2026-04-21T12:00:00.000Z",
        threadId: "thread_1",
        channelType: "email",
        threadTag: "Returns",
        customerHandle: "Taylor",
        instruction: "Reply and close",
        summary: "Resolved the ticket.",
        actions: [
          { tool: "send_reply", result: "Reply sent to customer via email." },
          { tool: "update_thread_status", result: "Status set to closed." },
        ],
      },
    ]);
    mockSerializeCsv.mockReturnValue("timestamp,customer\n2026-04-21T12:00:00.000Z,Taylor");

    const res = await GET(new Request("http://localhost:3000/api/agent/actions?format=csv"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(await res.text()).toContain("timestamp,customer");
    expect(mockListAllEntries).toHaveBeenCalledWith({
      orgId: "org_db_1",
      filters: {
        channels: undefined,
        tools: undefined,
        errorsOnly: undefined,
        from: undefined,
        to: undefined,
      },
    });
    expect(mockSerializeCsv).toHaveBeenCalledOnce();
    expect(mockListEntries).not.toHaveBeenCalled();
  });

  it("returns 401 when there is no authenticated user", async () => {
    vi.mocked(auth).mockResolvedValue({
      userId: null,
      orgId: null,
    } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);

    const res = await GET(new Request("http://localhost:3000/api/agent/actions"));
    expect(res.status).toBe(401);
    expect(mockListEntries).not.toHaveBeenCalled();
  });
});

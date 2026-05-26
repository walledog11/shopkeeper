import { describe, expect, it } from "vitest";
import {
  agentTurnMessageFilter,
  excludeAgentTurnMessages,
  extractAgentTurnsFromMessages,
  isAgentTurnContent,
  serializeAgentActionLogCsv,
} from "@/lib/agent/api/action-log";
import { serializeAgentTurn, toActionLogEntry } from "@/lib/agent/api/turns";

describe("agent action-log helpers", () => {
  it("detects serialized agent turn content", () => {
    const content = serializeAgentTurn({
      instruction: "Handle this",
      actions: [{ tool: "lookup_order", result: "ok" }],
      summary: "Done",
      error: null,
    });

    expect(isAgentTurnContent(content)).toBe(true);
    expect(isAgentTurnContent("plain text")).toBe(false);
  });

  it("extracts agent turns from mixed message content", () => {
    const turn = {
      instruction: "Handle this",
      actions: [{ tool: "lookup_order", result: "ok" }],
      summary: "Done",
      error: null,
    };

    const turns = extractAgentTurnsFromMessages([
      { id: "msg_1", contentText: "plain text" },
      { id: "msg_2", contentText: serializeAgentTurn(turn) },
    ]);

    expect(turns).toEqual([turn]);
  });

  it("filters agent turn note messages out of message lists", () => {
    const filtered = excludeAgentTurnMessages([
      { id: "msg_1", contentText: "plain text" },
      {
        id: "msg_2",
        contentText: serializeAgentTurn({
          instruction: "Handle this",
          actions: [],
          summary: "Done",
          error: null,
        }),
      },
    ]);

    expect(filtered).toEqual([{ id: "msg_1", contentText: "plain text" }]);
  });

  it("exports a canonical message filter shape for prisma queries", () => {
    expect(agentTurnMessageFilter).toEqual({
      senderType: "note",
      contentText: { startsWith: "__clerk_agent__" },
    });
  });

  it("falls back to tool labels when a turn summary is missing", () => {
    const entry = toActionLogEntry(
      {
        id: "msg_1",
        sentAt: new Date("2026-04-21T12:00:00.000Z"),
        thread: {
          id: "thread_1",
          channelType: "email",
          tag: "Returns",
          customer: {
            name: "Taylor",
            platformId: "taylor@example.com",
          },
        },
      },
      {
        instruction: "Close this out",
        actions: [
          { tool: "send_reply", result: "Reply sent." },
          { tool: "update_thread_status", result: "Status set to closed." },
        ],
        summary: null,
        error: null,
      },
    );

    expect(entry?.summary).toBe("Sent reply · Updated thread status");
  });

  it("serializes action log entries as CSV with action details", () => {
    const csv = serializeAgentActionLogCsv([
      {
        id: "msg_1",
        sentAt: "2026-04-21T12:00:00.000Z",
        threadId: "thread_1",
        channelType: "email",
        threadTag: "Returns",
        customerHandle: "Taylor",
        instruction: "Refund the order",
        summary: "Issued the refund and closed the ticket.",
        actions: [
          { tool: "create_refund", result: "Refunded $25.00." },
          { tool: "update_thread_status", result: "Status set to closed." },
        ],
        mode: "auto_executed",
      },
    ]);

    expect(csv).toContain("timestamp,customer,channel,thread_tag,thread_id,mode,instruction,summary,actions,action_results");
    expect(csv).toContain('"Taylor","email","Returns","thread_1","auto_executed","Refund the order"');
    expect(csv).toContain('"Issued refund | Updated thread status"');
    expect(csv).toContain('"Issued refund: Refunded $25.00. || Updated thread status: Status set to closed."');
  });
});

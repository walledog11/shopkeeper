import { describe, expect, it } from "vitest";
import {
  ACTION_LOG_CSV_HEADERS,
  actionLogEntryToCsvRow,
  decodeAgentActionCursor,
  encodeAgentActionCursor,
} from "@/lib/agent/api/action-log";
import {
  agentTurnMessageFilter,
  excludeAgentTurnMessages,
  extractAgentTurnsFromMessages,
  serializeAgentTurn,
} from "@/lib/agent/api/turns";
import { isAgentTurnContent } from "@clerk/agent/tools";
import type { ActionLogEntry } from "@/types";

describe("agent action-log note helpers", () => {
  it("detects serialized agent turn content", () => {
    const content = serializeAgentTurn({
      instruction: "Handle this",
      actions: [],
      summary: "Done",
      error: null,
    });

    expect(isAgentTurnContent(content)).toBe(true);
    expect(isAgentTurnContent("plain text")).toBe(false);
  });

  it("extracts agent turns from mixed message content", () => {
    const turn = {
      instruction: "Handle this",
      actions: [],
      summary: "Done",
      error: null,
    };

    const turns = extractAgentTurnsFromMessages([
      { id: "msg_1", contentText: "plain text" },
      { id: "msg_2", contentText: serializeAgentTurn(turn) },
    ]);

    expect(turns).toEqual([turn]);
  });

  it("still parses legacy note payloads that include the actions array", () => {
    const legacy = `__clerk_agent__${JSON.stringify({
      instruction: "Refund the order",
      actions: [{ tool: "create_refund", result: "Refunded $25.00." }],
      summary: "Issued the refund.",
      error: null,
    })}`;

    const [turn] = extractAgentTurnsFromMessages([{ id: "msg_legacy", contentText: legacy }]);
    expect(turn.actions).toEqual([{ tool: "create_refund", result: "Refunded $25.00." }]);
    expect(turn.summary).toBe("Issued the refund.");
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
});

describe("agent action-log CSV", () => {
  const entry: ActionLogEntry = {
    id: "turn_1",
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
    approver: null,
  };

  it("actionLogEntryToCsvRow escapes quotes inside cells", () => {
    const tricky: ActionLogEntry = {
      ...entry,
      summary: 'He said "hello"',
      actions: [],
    };
    const row = actionLogEntryToCsvRow(tricky);
    expect(row).toContain('"He said ""hello"""');
  });

  it("actionLogEntryToCsvRow leaves thread metadata blank for workspace actions", () => {
    const row = actionLogEntryToCsvRow({
      ...entry,
      threadId: null,
      channelType: null,
      threadTag: null,
      customerHandle: null,
      instruction: "order-risk-review:998877",
      summary: "Flagged order.",
    });

    expect(row).toBe('"2026-04-21T12:00:00.000Z","","","","","auto_executed","order-risk-review:998877","Flagged order.","Issued refund | Updated thread status","Issued refund: Refunded $25.00. || Updated thread status: Status set to closed."');
  });
});

describe("agent action-log cursor codec", () => {
  it("round-trips an executedAt + turnId cursor", () => {
    const cursor = { executedAt: "2026-04-21T12:00:00.000Z", turnId: "22222222-2222-2222-2222-222222222222" };
    const encoded = encodeAgentActionCursor(cursor);
    expect(decodeAgentActionCursor(encoded)).toEqual(cursor);
  });

  it("returns null for malformed cursors", () => {
    expect(decodeAgentActionCursor("garbage")).toBeNull();
    expect(decodeAgentActionCursor(encodeAgentActionCursor({ executedAt: "not-a-date", turnId: "x" }))).toBeNull();
  });
});

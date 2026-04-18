import { describe, expect, it } from "vitest";
import {
  agentTurnMessageFilter,
  excludeAgentTurnMessages,
  extractAgentTurnsFromMessages,
  isAgentTurnContent,
} from "@/lib/agent/api/action-log";
import { serializeAgentTurn } from "@/lib/agent/api/turns";

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
});

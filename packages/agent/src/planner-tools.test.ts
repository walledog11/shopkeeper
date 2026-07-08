import { describe, expect, it } from "vitest";
import { mergeReplanToolCalls, replanNeedsSendReplyRetry, selectInitialPlanningTools, selectReplanRetryTools } from "./planner-tools.js";
import { AGENT_TOOLS } from "./tools/registry/index.js";
import type { RawToolCall } from "./types.js";

describe("selectInitialPlanningTools", () => {
  it("includes every tool except send_reply", () => {
    const selected = selectInitialPlanningTools(AGENT_TOOLS);
    const names = selected.map((tool) => tool.name);

    expect(names).toContain("search_kb");
    expect(names).toContain("get_order_by_name");
    expect(names).toContain("escalate_to_human");
    expect(names).toContain("create_refund");
    expect(names).not.toContain("send_reply");

    expect(AGENT_TOOLS.some((tool) => tool.name === "send_reply")).toBe(true);
    expect(selected).toHaveLength(AGENT_TOOLS.length - 1);
  });
});

describe("mergeReplanToolCalls", () => {
  it("replaces mutative phase-1 calls with replan output", () => {
    const phase1: RawToolCall[] = [
      { id: "tu_read", name: "get_order_by_name", input: { order_name: "#1040" } },
      { id: "tu_refund_1", name: "create_refund", input: { order_id: "123", amount: "10.00" } },
    ];
    const replan: RawToolCall[] = [
      { id: "tu_refund_2", name: "create_refund", input: { order_id: "123", amount: "10.00" } },
      { id: "tu_reply", name: "send_reply", input: { text: "Refund processed." } },
    ];

    expect(mergeReplanToolCalls(phase1, replan).map((call) => call.name)).toEqual([
      "get_order_by_name",
      "create_refund",
      "send_reply",
    ]);
    expect(mergeReplanToolCalls(phase1, replan).filter((call) => call.name === "create_refund")).toHaveLength(1);
  });

  it("keeps phase-1 escalation when replan adds no escalate call", () => {
    const phase1: RawToolCall[] = [
      { id: "tu_escalate", name: "escalate_to_human", input: { reason: "Out of scope" } },
    ];
    const replan: RawToolCall[] = [
      { id: "tu_reply", name: "send_reply", input: { text: "Handing off." } },
    ];

    expect(mergeReplanToolCalls(phase1, replan).map((call) => call.name)).toEqual([
      "escalate_to_human",
      "send_reply",
    ]);
  });

  it("drops premature phase-1 send_reply when replan runs", () => {
    const phase1: RawToolCall[] = [
      { id: "tu_read", name: "search_kb", input: { query: "refund" } },
      { id: "tu_reply_1", name: "send_reply", input: { text: "Too early." } },
    ];
    const replan: RawToolCall[] = [
      { id: "tu_refund", name: "create_refund", input: { order_id: "123", amount: "10.00" } },
      { id: "tu_reply_2", name: "send_reply", input: { text: "Refund processed." } },
    ];

    expect(mergeReplanToolCalls(phase1, replan).map((call) => call.name)).toEqual([
      "search_kb",
      "create_refund",
      "send_reply",
    ]);
    expect(mergeReplanToolCalls(phase1, replan).find((call) => call.name === "send_reply")?.id).toBe("tu_reply_2");
  });
});

describe("replanNeedsSendReplyRetry", () => {
  it("returns true when replan has action tools but no send_reply on customer channels", () => {
    const blocks = [
      { type: "tool_use", id: "tu_1", name: "create_refund", input: {} },
    ] as unknown as import("@anthropic-ai/sdk").ToolUseBlock[];

    expect(replanNeedsSendReplyRetry(blocks, { operatorMode: false, sendReplyAvailable: true })).toBe(true);
  });

  it("returns false when replan already includes send_reply", () => {
    const blocks = [
      { type: "tool_use", id: "tu_1", name: "create_refund", input: {} },
      { type: "tool_use", id: "tu_2", name: "send_reply", input: {} },
    ] as unknown as import("@anthropic-ai/sdk").ToolUseBlock[];

    expect(replanNeedsSendReplyRetry(blocks, { operatorMode: false, sendReplyAvailable: true })).toBe(false);
  });

  it("returns false on operator channels", () => {
    const blocks = [
      { type: "tool_use", id: "tu_1", name: "create_refund", input: {} },
    ] as unknown as import("@anthropic-ai/sdk").ToolUseBlock[];

    expect(replanNeedsSendReplyRetry(blocks, { operatorMode: true, sendReplyAvailable: true })).toBe(false);
  });
});

describe("selectReplanRetryTools", () => {
  it("includes action tools from the first replan plus reply and internal support tools", () => {
    const firstReplanBlocks = [
      { type: "tool_use", id: "tu_1", name: "create_refund", input: {} },
    ] as unknown as import("@anthropic-ai/sdk").ToolUseBlock[];

    const selected = selectReplanRetryTools(AGENT_TOOLS, firstReplanBlocks).map((tool) => tool.name);

    expect(selected).toEqual(expect.arrayContaining([
      "create_refund",
      "send_reply",
      "add_internal_note",
      "update_thread_status",
    ]));
    expect(selected).not.toContain("cancel_order");
    expect(selected).not.toContain("search_kb");
  });
});

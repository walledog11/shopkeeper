import { describe, expect, it } from "vitest";
import { BadRequestError } from "@/lib/api/errors";
import { encodeActionLogCursor } from "@/lib/agent/api/turns";
import {
  parseActionLogCursorQuery,
  parseAgentInternalBody,
  parseAgentRouteBody,
} from "@/lib/agent/api/validation";

describe("agent api validation", () => {
  it("parses approved tool calls for the agent route", () => {
    const parsed = parseAgentRouteBody({
      threadId: "thread_123",
      instruction: "  Handle this  ",
      approvedToolCalls: [{ id: "tool_1", name: "lookup_order", input: { orderId: "123" } }],
    });

    expect(parsed).toEqual({
      threadId: "thread_123",
      instruction: "Handle this",
      approvedToolCalls: [{ id: "tool_1", name: "lookup_order", input: { orderId: "123" } }],
    });
  });

  it("rejects malformed approved tool calls", () => {
    try {
      parseAgentRouteBody({
        threadId: "thread_123",
        instruction: "Handle this",
        approvedToolCalls: [{ id: 123, name: "lookup_order" }],
      });
      throw new Error("Expected parseAgentRouteBody to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestError);
      expect((error as BadRequestError).details).toEqual([
        { code: "required", field: "approvedToolCalls[0].id", message: "Tool call id is required" },
      ]);
    }
  });

  it("rejects malformed internal payload strings", () => {
    try {
      parseAgentInternalBody({
        orgId: "org_123",
        instruction: "Handle this",
        senderPhone: 12345,
      });
      throw new Error("Expected parseAgentInternalBody to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestError);
      expect((error as BadRequestError).details).toEqual([
        { code: "invalid", field: "senderPhone", message: "senderPhone must be a string" },
      ]);
    }
  });

  it("decodes a valid action log cursor", () => {
    const cursor = encodeActionLogCursor({ sentAt: "2026-04-18T12:00:00.000Z", id: "msg_123" });
    const parsed = parseActionLogCursorQuery(new Request(`http://localhost:3000/api/agent/actions?cursor=${cursor}`));

    expect(parsed.cursor).toEqual({ sentAt: "2026-04-18T12:00:00.000Z", id: "msg_123" });
  });

  it("rejects an invalid action log cursor", () => {
    try {
      parseActionLogCursorQuery(new Request("http://localhost:3000/api/agent/actions?cursor=not-valid"))
      throw new Error("Expected parseActionLogCursorQuery to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestError);
      expect((error as BadRequestError).details).toEqual([
        { code: "invalid", field: "cursor", message: "Cursor is invalid" },
      ]);
    }
  });
});

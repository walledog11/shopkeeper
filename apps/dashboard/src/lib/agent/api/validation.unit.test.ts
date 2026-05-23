import { describe, expect, it } from "vitest";
import { BadRequestError } from "@/lib/api/errors";
import { encodeActionLogCursor } from "@/lib/agent/api/turns";
import {
  parseActionLogCursorQuery,
  parseAgentAskBody,
  parseAgentInternalBody,
  parseAgentRouteBody,
} from "@/lib/agent/api/validation";

describe("agent api validation", () => {
  it("parses composer ask payloads", () => {
    expect(parseAgentAskBody({
      threadId: "thread_123",
      instruction: "  What should I say?  ",
    })).toEqual({
      threadId: "thread_123",
      instruction: "What should I say?",
    });
  });

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
    expect(parsed.filters).toEqual({
      channels: undefined,
      tools: undefined,
      errorsOnly: undefined,
      from: undefined,
      to: undefined,
    });
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

  it("parses channel, tool, errorsOnly and date-range filters", () => {
    const url = "http://localhost:3000/api/agent/actions?channel=email,ig_dm&tool=create_refund,send_reply&errorsOnly=true&from=2026-04-01T00:00:00.000Z&to=2026-04-30T23:59:59.999Z";
    const { filters } = parseActionLogCursorQuery(new Request(url));

    expect(filters.channels).toEqual(["email", "ig_dm"]);
    expect(filters.tools).toEqual(["create_refund", "send_reply"]);
    expect(filters.errorsOnly).toBe(true);
    expect(filters.from?.toISOString()).toBe("2026-04-01T00:00:00.000Z");
    expect(filters.to?.toISOString()).toBe("2026-04-30T23:59:59.999Z");
  });

  it("ignores empty filter values and defaults errorsOnly to undefined", () => {
    const { filters } = parseActionLogCursorQuery(new Request("http://localhost:3000/api/agent/actions?channel=&tool=&errorsOnly=false"));

    expect(filters.channels).toBeUndefined();
    expect(filters.tools).toBeUndefined();
    expect(filters.errorsOnly).toBeUndefined();
  });

  it("rejects an invalid from date", () => {
    try {
      parseActionLogCursorQuery(new Request("http://localhost:3000/api/agent/actions?from=not-a-date"));
      throw new Error("Expected parseActionLogCursorQuery to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestError);
      expect((error as BadRequestError).details).toEqual([
        { code: "invalid", field: "from", message: "from must be a valid ISO date" },
      ]);
    }
  });

  it("rejects when 'to' is before 'from'", () => {
    try {
      parseActionLogCursorQuery(new Request("http://localhost:3000/api/agent/actions?from=2026-04-10T00:00:00.000Z&to=2026-04-05T00:00:00.000Z"));
      throw new Error("Expected parseActionLogCursorQuery to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestError);
      expect((error as BadRequestError).details).toEqual([
        { code: "invalid", field: "to", message: "to must be after from" },
      ]);
    }
  });
});

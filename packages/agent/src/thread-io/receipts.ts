import { createHash } from "node:crypto";
import { toolError, toolNotFound, toolOk, toolUnknown, type ReceiptV1, type ToolResult } from "../tools/result.js";
import type { ThreadSinkContext } from "./types.js";

export type InternalThreadReceiptTool =
  | "add_internal_note"
  | "update_thread_status"
  | "update_thread_tag";

export function successfulThreadReceipt(
  ctx: ThreadSinkContext,
  tool: InternalThreadReceiptTool,
  providerReference: string,
  facts: Record<string, unknown>,
): ReceiptV1 | undefined {
  if (!ctx.operationId || !ctx.executionId) return undefined;
  return {
    version: 1,
    operationId: ctx.operationId,
    executionId: ctx.executionId,
    tool,
    target: { kind: "thread", id: ctx.threadId },
    observedAt: new Date().toISOString(),
    providerReference,
    outcome: "succeeded",
    facts,
  } as unknown as ReceiptV1;
}

export type CommunicationTool = "send_reply" | "send_email";

export function communicationFailure(
  ctx: ThreadSinkContext,
  tool: CommunicationTool,
  target: { kind: "thread" | "email"; id: string },
  outcome: "failed" | "not_found" | "unknown",
  code: string,
  message: string,
): ToolResult {
  const result = outcome === "unknown"
    ? toolUnknown(message)
    : outcome === "not_found"
      ? toolNotFound(message)
      : toolError(message);
  if (!ctx.operationId || !ctx.executionId) return result;
  return {
    ...result,
    receipt: {
      version: 1,
      operationId: ctx.operationId,
      executionId: ctx.executionId,
      tool,
      target,
      observedAt: new Date().toISOString(),
      providerReference: null,
      outcome,
      code,
    },
  };
}

export function communicationSuccess(
  ctx: ThreadSinkContext,
  tool: CommunicationTool,
  args: {
    threadId: string;
    destination: { kind: "thread" | "email"; id: string };
    text: string;
    message: { id: string; sendStatus?: string | null; providerMessageId?: string | null };
    deliveryState?: "accepted" | "sent" | "delivered";
  },
  display: string,
): ToolResult {
  const result = toolOk(display);
  if (!ctx.operationId || !ctx.executionId) return result;
  const deliveryState = args.deliveryState
    ?? (args.message.sendStatus === "pending" || args.message.sendStatus === "processing" ? "accepted" : "sent");
  return {
    ...result,
    receipt: {
      version: 1,
      operationId: ctx.operationId,
      executionId: ctx.executionId,
      tool,
      target: { kind: "thread", id: args.threadId },
      observedAt: new Date().toISOString(),
      providerReference: args.message.id,
      outcome: "succeeded",
      facts: {
        logicalResponseId: args.message.id,
        messageId: args.message.id,
        threadId: args.threadId,
        destination: args.destination,
        contentSha256: createHash("sha256").update(args.text).digest("hex"),
        deliveryState,
        providerMessageId: args.message.providerMessageId ?? null,
      },
    },
  };
}

export function dispatchFailureReceipt(
  ctx: ThreadSinkContext,
  op: CommunicationTool,
  target: { kind: "thread" | "email"; id: string },
  outcome: "failed" | "unknown",
  code: string,
  message: string,
): ToolResult {
  const result = outcome === "unknown" ? toolUnknown(message) : toolError(message);
  if (!ctx.operationId || !ctx.executionId) return result;
  return {
    ...result,
    receipt: {
      version: 1,
      operationId: ctx.operationId,
      executionId: ctx.executionId,
      tool: op,
      target,
      observedAt: new Date().toISOString(),
      providerReference: null,
      outcome,
      code,
    },
  };
}

/**
 * Internal agent send hop — called by the gateway worker's in-process ThreadSink
 * (Track 4.2) for the two provider-coupled tools, send_reply and send_email.
 * Postmark / Instagram delivery stays in the dashboard (the package boundary:
 * touches a message provider — dashboard), so the worker hops here to dispatch.
 *
 * Auth: x-internal-secret header. No Clerk session.
 *
 * Body: { orgId, threadId, orgName, op: "send_reply" | "send_email", input }
 * Response: ToolResult ({ status, message })
 */
import { NextResponse } from "next/server";
import { INTERNAL_REQUEST_ID_HEADER } from "@shopkeeper/agent/message-dispatch";
import { db } from "@shopkeeper/db";
import { sendReply, sendEmail } from "@/lib/agent/tools/thread";
import type { SendReplyInput, SendEmailInput } from "@shopkeeper/agent/tools";
import type { AgentActionMode } from "@shopkeeper/agent/context";
import { readRequiredJsonObject } from "@/lib/api/body";
import { BadRequestError } from "@/lib/api/errors";
import { withInternalRoute } from "@/lib/api/internal-route";
import logger from "@/lib/server/logger";

export const maxDuration = 60;

function readRequestId(request: Request): string | undefined {
  const value = request.headers.get(INTERNAL_REQUEST_ID_HEADER)?.trim();
  return value || undefined;
}

interface IoSendBody {
  agentActionMode?: AgentActionMode;
  orgId: string;
  threadId: string;
  op: "send_reply" | "send_email";
  input: unknown;
}

function parseBody(value: Record<string, unknown>): IoSendBody {
  const { agentActionMode, orgId, threadId, op, input } = value;
  if (typeof orgId !== "string" || typeof threadId !== "string") {
    throw new BadRequestError("orgId and threadId are required");
  }
  if (op !== "send_reply" && op !== "send_email") {
    throw new BadRequestError("op must be send_reply or send_email");
  }
  if (!input || typeof input !== "object") {
    throw new BadRequestError("input is required");
  }
  if (
    agentActionMode !== undefined
    && agentActionMode !== "human_approved"
    && agentActionMode !== "auto_executed"
    && agentActionMode !== "read_only"
  ) {
    throw new BadRequestError("invalid agentActionMode");
  }
  return {
    ...(agentActionMode ? { agentActionMode } : {}),
    orgId,
    threadId,
    op,
    input,
  };
}

export const POST = withInternalRoute(
  {
    context: "Agent io-send-internal POST",
    errorMessage: "Failed to dispatch agent message",
  },
  async ({ request }) => {
    const requestId = readRequestId(request);
    const { agentActionMode, orgId, threadId, op, input } = parseBody(
      await readRequiredJsonObject(request, {
        malformed: { message: "Validation failed", details: [{ code: "invalid_body", message: "Request body must be a JSON object" }] },
        empty: { message: "Validation failed", details: [{ code: "invalid_body", message: "Request body must be a JSON object" }] },
        object: { message: "Validation failed", details: [{ code: "invalid_body", message: "Request body must be a JSON object" }] },
      }),
    );

    const ownedThread = await db.thread.findFirst({
      where: { id: threadId, organizationId: orgId },
      select: { organization: { select: { name: true } } },
    });
    if (!ownedThread) {
      logger.warn({ requestId, orgId, threadId }, "[Agent io-send-internal] thread not found");
      return NextResponse.json(
        { error: "Thread not found", ...(requestId ? { requestId } : {}) },
        { status: 404 },
      );
    }

    try {
      const ctx = {
        threadId,
        orgId,
        orgName: ownedThread.organization.name,
        ...(agentActionMode ? { agentActionMode } : {}),
      };
      const result = op === "send_reply"
        ? await sendReply(input as SendReplyInput, ctx)
        : await sendEmail(input as SendEmailInput, ctx);

      return NextResponse.json(result);
    } catch (error) {
      logger.error({ err: error, requestId, orgId, threadId, op }, "[Agent io-send-internal] dispatch failed");
      throw error;
    }
  },
);

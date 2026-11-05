import { createHash } from "node:crypto"
import type { AgentActionMode } from "@shopkeeper/agent/context"
import { CHANNEL_TYPE } from "@shopkeeper/agent/thread-constants"
import { communicationFailure, communicationSuccess, type ThreadSinkContext } from "@shopkeeper/agent/thread-io"
import { toolError, toolUnknown, type SendReplyInput, type ToolResult } from "@shopkeeper/agent/tools"
import type { ReplySource } from "@shopkeeper/analytics"
import { db } from "@shopkeeper/db"
import type {
  DispatchMessageOptions,
  DispatchMessageResult,
  DispatchOrg,
  DispatchThread,
} from "./types.js"

export function agentReplySource(mode: AgentActionMode | undefined): ReplySource {
  return mode === "auto_executed" ? "agent_automatic" : "agent_approved"
}

function agentReplyDispatchError(
  channelType: string,
  result: Extract<DispatchMessageResult, { ok: false }>,
): ToolResult {
  if (result.outcome === "unknown") {
    return toolUnknown(`Unknown: ${result.error}. Do not send it again automatically.`);
  }
  if (channelType === CHANNEL_TYPE.TIKTOK && result.providerStatus !== undefined) {
    return toolError(`Error: TikTok Shop dispatch failed (${result.providerStatus}).`);
  }
  if (result.error === "Email not configured" && result.detail) {
    return toolError(`Error: email not configured — ${result.detail}`);
  }
  if (result.error === "Email dispatch failed" && result.detail) {
    return toolError(`Error: email dispatch failed — ${result.detail}`);
  }

  const agentMessage = {
    "No Instagram integration configured": "no Instagram integration configured",
    "No TikTok Shop integration configured": "no TikTok Shop integration configured",
    "TikTok Shop messaging is not configured": "TikTok Shop messaging is not configured",
    "TikTok Shop token expired": "TikTok Shop token expired",
    "No email integration configured": "no email integration configured",
    "Email not configured": "email not configured",
    "Email dispatch failed": "email dispatch failed",
  }[result.error] ?? result.error;
  return toolError(`Error: ${agentMessage}.`);
}

/** The thread an agent reply goes to, with the customer it is addressed to. */
export function loadAgentReplyThread(ctx: ThreadSinkContext) {
  return db.thread.findFirst({
    where: { id: ctx.threadId, organizationId: ctx.orgId },
    include: { customer: true },
  }).catch(() => null)
}

export type AgentReplyThread = Awaited<ReturnType<typeof loadAgentReplyThread>>

export type AgentReplyDispatch = (
  thread: DispatchThread,
  org: DispatchOrg,
  text: string,
  options: DispatchMessageOptions,
) => Promise<DispatchMessageResult>

/**
 * An agent's `send_reply`: sends the text on the conversation's own channel
 * through `dispatch` and reports it as the tool result, with the receipt the
 * execution ledger settles on.
 */
export async function sendAgentReply(
  input: SendReplyInput,
  ctx: ThreadSinkContext,
  thread: AgentReplyThread,
  dispatch: AgentReplyDispatch,
): Promise<ToolResult> {
  if (!thread) return communicationFailure(ctx, 'send_reply', { kind: 'thread', id: ctx.threadId }, 'not_found', 'thread_not_found', "Error: thread not found.");
  if (
    thread.channelType !== CHANNEL_TYPE.IG_DM &&
    thread.channelType !== CHANNEL_TYPE.TIKTOK &&
    thread.channelType !== CHANNEL_TYPE.EMAIL &&
    thread.channelType !== CHANNEL_TYPE.SHOPIFY_CHAT
  ) {
    return communicationFailure(ctx, 'send_reply', { kind: 'thread', id: ctx.threadId }, 'failed', 'unsupported_channel', `Error: channel dispatch not implemented for ${thread.channelType}.`);
  }

  const result = await dispatch(
    thread,
    { id: ctx.orgId, name: ctx.orgName },
    input.text,
    {
      source: "agent_send_reply",
      analyticsReplySource: agentReplySource(ctx.agentActionMode),
      emailSubjectFallback: thread.tag || "Your inquiry",
      agentRequestId: ctx.agentRequestId,
      agentTaskId: ctx.agentTaskId,
    },
  );
  if (!result.ok) {
    const display = agentReplyDispatchError(thread.channelType, result);
    const failure = communicationFailure(
      ctx,
      'send_reply',
      { kind: 'thread', id: thread.id },
      result.outcome === 'unknown' ? 'unknown' : 'failed',
      result.code ?? (result.outcome === 'unknown' ? 'delivery_unknown' : 'delivery_failed'),
      display.message,
    );
    if (result.outcome !== 'unknown' || !result.message || !ctx.operationId || !ctx.executionId) {
      return failure;
    }
    return {
      ...failure,
      receipt: {
        version: 1,
        operationId: ctx.operationId,
        executionId: ctx.executionId,
        tool: 'send_reply',
        target: { kind: 'thread', id: thread.id },
        observedAt: new Date().toISOString(),
        providerReference: result.message.id,
        outcome: 'unknown',
        code: result.code ?? 'delivery_unknown',
        facts: {
          logicalResponseId: result.message.id,
          messageId: result.message.id,
          threadId: thread.id,
          destination: { kind: 'thread', id: thread.id },
          contentSha256: createHash('sha256').update(input.text).digest('hex'),
          deliveryState: 'unknown',
          providerMessageId: result.message.providerMessageId ?? null,
        },
      },
    };
  }

  if (thread.channelType === CHANNEL_TYPE.IG_DM) {
    return communicationSuccess(ctx, 'send_reply', { threadId: thread.id, destination: { kind: 'thread', id: thread.id }, text: input.text, message: result.message }, `Reply sent to customer via Instagram DM.`);
  }
  if (thread.channelType === CHANNEL_TYPE.TIKTOK) {
    return communicationSuccess(ctx, 'send_reply', { threadId: thread.id, destination: { kind: 'thread', id: thread.id }, text: input.text, message: result.message }, `Reply sent to customer via TikTok Shop.`);
  }
  return communicationSuccess(ctx, 'send_reply', { threadId: thread.id, destination: { kind: 'thread', id: thread.id }, text: input.text, message: result.message }, `Reply sent to customer via email.`);
}

import { randomUUID } from 'node:crypto';
import { composeThreadSink, dispatchFailureReceipt, type ThreadSinkContext } from '@shopkeeper/agent/thread-io';
import type { SendEmailInput, SendReplyInput } from '@shopkeeper/agent/tools';
import type { ToolResult } from '@shopkeeper/agent/tools';
import logger from '../../logger.js';
import { recordAgentFailureInBackground } from '../../agent-failure-alerts.js';
import { postDashboardInternal } from '../../clients/dashboard-internal.js';
import { pushOperatorEscalation } from '../../operator-escalation.js';
import { publishThreadEvent } from '../../realtime/publish.js';

function recordDispatchFailure(
  op: 'send_reply' | 'send_email',
  ctx: ThreadSinkContext,
  kind: 'tool_result' | 'tool_exception',
  detail: string,
  statusCode?: number,
): void {
  recordAgentFailureInBackground({
    kind,
    route: 'gateway-thread-sink',
    orgId: ctx.orgId,
    tool: op,
    statusCode: statusCode ?? null,
    detail,
  });
}

function formatDispatchFailureMessage(status: number | null | undefined, requestId: string): string {
  const statusLabel = status ?? 'unknown';
  return `Error: message dispatch failed (${statusLabel}). Reference: ${requestId}.`;
}

async function dispatchAgentSend(
  op: 'send_reply' | 'send_email',
  ctx: ThreadSinkContext,
  input: SendReplyInput | SendEmailInput,
): Promise<ToolResult> {
  const requestId = randomUUID();
  const failureTarget = op === 'send_email'
    ? { kind: 'email' as const, id: (input as SendEmailInput).to }
    : { kind: 'thread' as const, id: ctx.threadId };
  try {
    const response = await postDashboardInternal<ToolResult>('/api/agent/io-send-internal', {
      orgId: ctx.orgId,
      threadId: ctx.threadId,
      orgName: ctx.orgName,
      op,
      input,
      agentActionMode: ctx.agentActionMode,
      operationId: ctx.operationId,
      executionId: ctx.executionId,
      agentRequestId: ctx.agentRequestId,
      agentTaskId: ctx.agentTaskId,
    }, { requestId });
    if (!response.ok) {
      logger.warn(
        {
          op,
          status: response.status,
          threadId: ctx.threadId,
          requestId,
          body: response.responseBody.slice(0, 300),
        },
        '[agent-sink] dashboard send hop failed',
      );
      recordDispatchFailure(
        op,
        ctx,
        'tool_result',
        response.responseBody.slice(0, 300) || `HTTP ${response.status}`,
        response.status ?? undefined,
      );
      if (response.outcome === 'unknown') {
        return dispatchFailureReceipt(
          ctx,
          op,
          failureTarget,
          'unknown',
          'dashboard_response_unknown',
          `Unknown: message dispatch may have completed, but the dashboard response was not received. Reference: ${requestId}. Do not send it again automatically.`,
        );
      }
      return dispatchFailureReceipt(
        ctx,
        op,
        failureTarget,
        'failed',
        'dashboard_dispatch_failed',
        formatDispatchFailureMessage(response.status, requestId),
      );
    }
    return response.data;
  } catch (err) {
    const message = (err as Error).message;
    logger.error(
      { op, err: message, threadId: ctx.threadId, requestId },
      '[agent-sink] dashboard send hop errored',
    );
    recordDispatchFailure(op, ctx, 'tool_exception', message);
    return dispatchFailureReceipt(
      ctx,
      op,
      failureTarget,
      'unknown',
      'dashboard_request_unknown',
      `Unknown: message dispatch may have completed, but the dashboard request failed. Reference: ${requestId}. Do not send it again automatically.`,
    );
  }
}

async function sendReplyWithRealtime(input: SendReplyInput, ctx: ThreadSinkContext): Promise<ToolResult> {
  const result = await dispatchAgentSend('send_reply', ctx, input);
  if (result.status !== 'error') await publishThreadEvent(ctx.orgId, ctx.threadId);
  return result;
}

async function sendEmailWithRealtime(input: SendEmailInput, ctx: ThreadSinkContext): Promise<ToolResult> {
  const result = await dispatchAgentSend('send_email', ctx, input);
  if (result.status !== 'error') await publishThreadEvent(ctx.orgId, ctx.threadId);
  return result;
}

export const gatewayThreadSink = composeThreadSink({
  sendReply: sendReplyWithRealtime,
  sendEmail: sendEmailWithRealtime,
  afterMutation: async (ctx) => {
    await publishThreadEvent(ctx.orgId, ctx.threadId);
  },
  onEscalated: async (ctx, reason) => {
    await pushOperatorEscalation(ctx.orgId, ctx.threadId, reason).catch((err) => {
      logger.warn(
        { err: (err as Error).message, threadId: ctx.threadId },
        '[agent-sink] operator escalation push errored',
      );
    });
  },
});

import { db, SenderType, createMessage } from '@shopkeeper/db';
import { AGENT_NOTE_PREFIX, THREAD_STATUS } from '@shopkeeper/agent/thread-constants';
import type { ThreadSink } from '@shopkeeper/agent/build-context';
import { updateThreadStatusMutation } from '@shopkeeper/agent/thread-io';
import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { toolError, toolNotFound, toolOk, toolEscalated, toolUnknown, type ReceiptV1, type ToolResult } from '@shopkeeper/agent/tools';
import type {
  AddInternalNoteInput,
  AskOperatorInput,
  EscalateToHumanInput,
  SendEmailInput,
  SendReplyInput,
  UpdateThreadStatusInput,
  UpdateThreadTagInput,
} from '@shopkeeper/agent/tools';
import type { AgentActionMode } from '@shopkeeper/agent/context';
import logger from '../../logger.js';
import { recordAgentFailureInBackground } from '../../agent-failure-alerts.js';
import { postDashboardInternal } from '../../clients/dashboard-internal.js';
import { pushOperatorEscalation } from '../../operator-escalation.js';
import { publishThreadEvent } from '../../realtime/publish.js';

interface ThreadSinkContext {
  agentActionMode?: AgentActionMode;
  threadId: string;
  orgId: string;
  orgName: string;
  operationId?: string;
  executionId?: string;
  agentRequestId?: string;
  agentTaskId?: string;
}

function successfulThreadReceipt(
  ctx: ThreadSinkContext,
  tool: 'add_internal_note' | 'update_thread_status' | 'update_thread_tag',
  providerReference: string,
  facts: Record<string, unknown>,
): ReceiptV1 | undefined {
  if (!ctx.operationId || !ctx.executionId) return undefined;
  return {
    version: 1,
    operationId: ctx.operationId,
    executionId: ctx.executionId,
    tool,
    target: { kind: 'thread', id: ctx.threadId },
    observedAt: new Date().toISOString(),
    providerReference,
    outcome: 'succeeded',
    facts,
  } as unknown as ReceiptV1;
}

// Gateway worker ThreadSink: DB-only tools (note / tag / status / escalate) run
// in-process because the gateway already owns operator notify. Provider-coupled
// tools (send_reply / send_email) hop to the dashboard where Postmark / Instagram
// delivery lives.

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

function dispatchFailureReceipt(
  ctx: ThreadSinkContext,
  op: 'send_reply' | 'send_email',
  input: SendReplyInput | SendEmailInput,
  outcome: 'failed' | 'unknown',
  code: string,
  message: string,
): ToolResult {
  const result = outcome === 'unknown' ? toolUnknown(message) : toolError(message);
  if (!ctx.operationId || !ctx.executionId) return result;
  return {
    ...result,
    receipt: {
      version: 1,
      operationId: ctx.operationId,
      executionId: ctx.executionId,
      tool: op,
      target: op === 'send_email'
        ? { kind: 'email', id: (input as SendEmailInput).to }
        : { kind: 'thread', id: ctx.threadId },
      observedAt: new Date().toISOString(),
      providerReference: null,
      outcome,
      code,
    },
  };
}

async function dispatchAgentSend(
  op: 'send_reply' | 'send_email',
  ctx: ThreadSinkContext,
  input: SendReplyInput | SendEmailInput,
): Promise<ToolResult> {
  const requestId = randomUUID();
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
        return dispatchFailureReceipt(ctx, op, input, 'unknown', 'dashboard_response_unknown', `Unknown: message dispatch may have completed, but the dashboard response was not received. Reference: ${requestId}. Do not send it again automatically.`);
      }
      return dispatchFailureReceipt(ctx, op, input, 'failed', 'dashboard_dispatch_failed', formatDispatchFailureMessage(response.status, requestId));
    }
    return response.data;
  } catch (err) {
    const message = (err as Error).message;
    logger.error(
      { op, err: message, threadId: ctx.threadId, requestId },
      '[agent-sink] dashboard send hop errored',
    );
    recordDispatchFailure(op, ctx, 'tool_exception', message);
    return dispatchFailureReceipt(ctx, op, input, 'unknown', 'dashboard_request_unknown', `Unknown: message dispatch may have completed, but the dashboard request failed. Reference: ${requestId}. Do not send it again automatically.`);
  }
}

export const gatewayThreadSink: ThreadSink = {
  async addInternalNote(input: AddInternalNoteInput, ctx: ThreadSinkContext): Promise<ToolResult> {
    const owned = await db.thread.findFirst({
      where: { id: ctx.threadId, organizationId: ctx.orgId },
      select: { id: true },
    });
    if (!owned) return toolNotFound('Error: thread not found.');
    const message = await createMessage({
      threadId: ctx.threadId,
      organizationId: ctx.orgId,
      senderType: SenderType.note,
      contentText: `${AGENT_NOTE_PREFIX}${input.text}`,
    });
    await publishThreadEvent(ctx.orgId, ctx.threadId);
    const result = toolOk(`Note logged: "${input.text}"`);
    const receipt = successfulThreadReceipt(ctx, 'add_internal_note', message.id, {
      threadId: ctx.threadId,
      messageId: message.id,
      contentSha256: createHash('sha256').update(input.text).digest('hex'),
    });
    return receipt ? { ...result, receipt } : result;
  },

  async sendReply(input: SendReplyInput, ctx: ThreadSinkContext): Promise<ToolResult> {
    const result = await dispatchAgentSend('send_reply', ctx, input);
    if (result.status !== 'error') await publishThreadEvent(ctx.orgId, ctx.threadId);
    return result;
  },

  async sendEmail(input: SendEmailInput, ctx: ThreadSinkContext): Promise<ToolResult> {
    const result = await dispatchAgentSend('send_email', ctx, input);
    if (result.status !== 'error') await publishThreadEvent(ctx.orgId, ctx.threadId);
    return result;
  },

  // The shared mutation owns what a close does to the conversation's waiting
  // tasks (release-owner decision C).
  async updateThreadStatus(input: UpdateThreadStatusInput, ctx: ThreadSinkContext): Promise<ToolResult> {
    return updateThreadStatusMutation(input, ctx, (hookCtx) => publishThreadEvent(hookCtx.orgId, hookCtx.threadId));
  },

  async updateThreadTag(input: UpdateThreadTagInput, ctx: ThreadSinkContext): Promise<ToolResult> {
    const observed = await db.$transaction(async tx => {
      const before = await tx.thread.findFirst({
        where: { id: ctx.threadId, organizationId: ctx.orgId },
        select: { tag: true },
      });
      if (!before) return null;
      const after = await tx.thread.update({
        where: { id: ctx.threadId },
        data: { tag: input.tag },
        select: { tag: true },
      });
      return { before: before.tag, after: after.tag };
    });
    if (!observed) return toolNotFound('Error: thread not found.');
    await publishThreadEvent(ctx.orgId, ctx.threadId);
    const result = toolOk(`Thread tag updated to "${observed.after}".`);
    const receipt = successfulThreadReceipt(ctx, 'update_thread_tag', ctx.threadId, {
      threadId: ctx.threadId,
      beforeTag: observed.before,
      afterTag: observed.after,
    });
    return receipt ? { ...result, receipt } : result;
  },

  async escalateToHuman(input: EscalateToHumanInput, ctx: ThreadSinkContext): Promise<ToolResult> {
    const reason = input.reason.trim() || 'No reason provided';
    // P5-04: keep the ticket `open` so it stays in the inbox and inbound
    // follow-ups correlate to it; escalation rides on the orthogonal flag.
    const updated = await db.thread.updateMany({
      where: { id: ctx.threadId, organizationId: ctx.orgId },
      data: { status: THREAD_STATUS.OPEN, tag: 'needs_human', escalatedAt: new Date() },
    });
    if (updated.count !== 1) return toolError('Error: thread not found.');
    await createMessage({
      threadId: ctx.threadId,
      senderType: SenderType.note,
      contentText: `${AGENT_NOTE_PREFIX}Escalated to merchant: ${reason}`,
    });
    void pushOperatorEscalation(ctx.orgId, ctx.threadId, reason).catch((err) => {
      logger.warn(
        { err: (err as Error).message, threadId: ctx.threadId },
        '[agent-sink] operator escalation push errored',
      );
    });
    await publishThreadEvent(ctx.orgId, ctx.threadId);
    return toolEscalated(reason);
  },

  // Soft sibling of escalateToHuman — the agent needs one fact from the merchant
  // to finish the ticket. No thread-parking (the question rides in the cached plan
  // as `needs_merchant_input`). This sink only runs if an ask_operator plan is ever
  // executed; it never is (auto-execute runs only `auto_execute` plans), so the
  // Telegram push lives in the operator-notification path (sendOperatorQuestionNotification),
  // not here. We still record the note for the audit trail.
  async askOperator(input: AskOperatorInput, ctx: ThreadSinkContext): Promise<ToolResult> {
    const question = input.question.trim() || 'No question provided';
    await createMessage({
      threadId: ctx.threadId,
      senderType: SenderType.note,
      contentText: `${AGENT_NOTE_PREFIX}Asked the merchant: ${question}`,
    });
    await publishThreadEvent(ctx.orgId, ctx.threadId);
    return toolOk(question);
  },
};

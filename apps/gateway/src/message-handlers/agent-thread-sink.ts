import { db, SenderType, createMessage } from '@shopkeeper/db';
import { AGENT_NOTE_PREFIX, THREAD_STATUS } from '@shopkeeper/agent/thread-constants';
import type { ThreadSink } from '@shopkeeper/agent/build-context';
import { randomUUID } from 'node:crypto';
import { INTERNAL_REQUEST_ID_HEADER } from '@shopkeeper/agent/message-dispatch';
import { toolError, toolOk, toolEscalated, toolUnknown, type ToolResult } from '@shopkeeper/agent/tools';
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
import logger from '../logger.js';
import { recordAgentFailureInBackground } from '../agent-failure-alerts.js';
import { postDashboardInternal } from '../clients/dashboard-internal.js';
import { pushOperatorEscalation } from '../operator-escalation.js';
import { publishThreadEvent } from '../realtime/publish.js';

interface ThreadSinkContext {
  agentActionMode?: AgentActionMode;
  threadId: string;
  orgId: string;
  orgName: string;
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
        return toolUnknown(`Unknown: message dispatch may have completed, but the dashboard response was not received. Reference: ${requestId}. Do not send it again automatically.`);
      }
      return toolError(formatDispatchFailureMessage(response.status, requestId));
    }
    return response.data;
  } catch (err) {
    const message = (err as Error).message;
    logger.error(
      { op, err: message, threadId: ctx.threadId, requestId },
      '[agent-sink] dashboard send hop errored',
    );
    recordDispatchFailure(op, ctx, 'tool_exception', message);
    return toolError(formatDispatchFailureMessage(null, requestId));
  }
}

export const gatewayThreadSink: ThreadSink = {
  async addInternalNote(input: AddInternalNoteInput, ctx: ThreadSinkContext): Promise<ToolResult> {
    await createMessage({
      threadId: ctx.threadId,
      senderType: SenderType.note,
      contentText: `${AGENT_NOTE_PREFIX}${input.text}`,
    });
    await publishThreadEvent(ctx.orgId, ctx.threadId);
    return toolOk(`Note logged: "${input.text}"`);
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

  async updateThreadStatus(input: UpdateThreadStatusInput, ctx: ThreadSinkContext): Promise<ToolResult> {
    await db.thread.update({
      where: { id: ctx.threadId },
      data: { status: input.status },
    });
    await publishThreadEvent(ctx.orgId, ctx.threadId);
    return toolOk(`Thread status updated to "${input.status}".`);
  },

  async updateThreadTag(input: UpdateThreadTagInput, ctx: ThreadSinkContext): Promise<ToolResult> {
    await db.thread.update({
      where: { id: ctx.threadId },
      data: { tag: input.tag },
    });
    await publishThreadEvent(ctx.orgId, ctx.threadId);
    return toolOk(`Thread tag updated to "${input.tag}".`);
  },

  async escalateToHuman(input: EscalateToHumanInput, ctx: ThreadSinkContext): Promise<ToolResult> {
    const reason = input.reason.trim() || 'No reason provided';
    // P5-04: keep the ticket `open` so it stays in the inbox and inbound
    // follow-ups correlate to it; escalation rides on the orthogonal flag.
    await db.thread.update({
      where: { id: ctx.threadId },
      data: { status: THREAD_STATUS.OPEN, tag: 'needs_human', escalatedAt: new Date() },
    });
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

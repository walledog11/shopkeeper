import { db, SenderType, createMessage } from '@clerk/db';
import { AGENT_NOTE_PREFIX, THREAD_STATUS, isOperatorChannel } from '@clerk/agent/thread-constants';
import type { ThreadSink } from '@clerk/agent/build-context';
import { toolError, toolOk, toolEscalated, type ToolResult } from '@clerk/agent/tools';
import type {
  AddInternalNoteInput,
  EscalateToHumanInput,
  SendEmailInput,
  SendReplyInput,
  UpdateThreadStatusInput,
  UpdateThreadTagInput,
} from '@clerk/agent/tools';
import logger from '../logger.js';
import { getGatewayDashboardUrl } from '../config/env.js';
import { getInternalApiSecret } from './shared.js';
import { pushOperatorEscalation } from '../routes/internal-operator.js';
import { enqueueCustomerMemoryThreadClose } from '../maintenance/customer-memory.js';
import { getCustomerMemoryQueue } from '../clients/agent-runtime.js';

interface ThreadSinkContext {
  threadId: string;
  orgId: string;
  orgName: string;
}

// The gateway worker's in-process ThreadSink (Track 4.2). DB-only operations
// (note / tag / status / escalate) run in-process — the gateway already owns the
// customer-memory queue and the operator-notify path the dashboard sink hops to.
// The two provider-coupled tools (send_reply / send_email) hop back to the
// dashboard, where Postmark / Instagram delivery lives (package boundary: touches
// a message provider , dashboard).

async function dispatchAgentSend(
  op: 'send_reply' | 'send_email',
  ctx: ThreadSinkContext,
  input: SendReplyInput | SendEmailInput,
): Promise<ToolResult> {
  try {
    const response = await fetch(`${getGatewayDashboardUrl()}/api/agent/io-send-internal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': getInternalApiSecret(),
      },
      body: JSON.stringify({ orgId: ctx.orgId, threadId: ctx.threadId, orgName: ctx.orgName, op, input }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      logger.warn(
        { op, status: response.status, threadId: ctx.threadId, body: body.slice(0, 300) },
        '[agent-sink] dashboard send hop failed',
      );
      return toolError(`Error: message dispatch failed (${response.status}).`);
    }
    return await response.json() as ToolResult;
  } catch (err) {
    logger.error(
      { op, err: (err as Error).message, threadId: ctx.threadId },
      '[agent-sink] dashboard send hop errored',
    );
    return toolError('Error: message dispatch failed.');
  }
}

export const gatewayThreadSink: ThreadSink = {
  async addInternalNote(input: AddInternalNoteInput, ctx: ThreadSinkContext): Promise<ToolResult> {
    await createMessage({
      threadId: ctx.threadId,
      senderType: SenderType.note,
      contentText: `${AGENT_NOTE_PREFIX}${input.text}`,
    });
    return toolOk(`Note logged: "${input.text}"`);
  },

  sendReply(input: SendReplyInput, ctx: ThreadSinkContext): Promise<ToolResult> {
    return dispatchAgentSend('send_reply', ctx, input);
  },

  sendEmail(input: SendEmailInput, ctx: ThreadSinkContext): Promise<ToolResult> {
    return dispatchAgentSend('send_email', ctx, input);
  },

  async updateThreadStatus(input: UpdateThreadStatusInput, ctx: ThreadSinkContext): Promise<ToolResult> {
    const updated = await db.thread.update({
      where: { id: ctx.threadId },
      data: { status: input.status },
      select: { updatedAt: true, channelType: true },
    });
    if (input.status === THREAD_STATUS.CLOSED && !isOperatorChannel(updated.channelType)) {
      await enqueueCustomerMemoryThreadClose(getCustomerMemoryQueue(), {
        organizationId: ctx.orgId,
        threadId: ctx.threadId,
        closedAt: updated.updatedAt.toISOString(),
      }).catch((err) => {
        logger.warn(
          { err: (err as Error).message, threadId: ctx.threadId },
          '[agent-sink] customer-memory enqueue on close failed',
        );
      });
    }
    return toolOk(`Thread status updated to "${input.status}".`);
  },

  async updateThreadTag(input: UpdateThreadTagInput, ctx: ThreadSinkContext): Promise<ToolResult> {
    await db.thread.update({
      where: { id: ctx.threadId },
      data: { tag: input.tag },
    });
    return toolOk(`Thread tag updated to "${input.tag}".`);
  },

  async escalateToHuman(input: EscalateToHumanInput, ctx: ThreadSinkContext): Promise<ToolResult> {
    const reason = input.reason.trim() || 'No reason provided';
    await db.thread.update({
      where: { id: ctx.threadId },
      data: { status: THREAD_STATUS.PENDING, tag: 'needs_human' },
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
    return toolEscalated(reason);
  },
};

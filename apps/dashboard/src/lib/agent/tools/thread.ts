import { db, SenderType, createMessage } from "@shopkeeper/db";
import { createHash } from "node:crypto";
import { AGENT_NOTE_PREFIX, CHANNEL_TYPE, THREAD_STATUS } from "@shopkeeper/agent/thread-constants";
import { recordOutboundCall } from "@/lib/server/outbound-recorder";
import logger from "@/lib/server/logger";
import { getGatewayBaseUrl } from "@/lib/server/gateway-url";
import { fetchProviderWithDeadline } from "@/lib/server/provider-fetch";
import { getEmailProvider } from "@shopkeeper/email/providers";
import { buildThreadReplyHeaders, formatReplySubject } from "@shopkeeper/email/reply";
import { getEmailSender } from "@shopkeeper/email/senders";
import { EmailNotConfiguredError } from "@shopkeeper/email/types";
import { resolveEmailIntegration } from "@shopkeeper/email/integration-resolution";
import { dispatchMessage, type DispatchMessageResult } from "@/lib/messaging/dispatch-message";
import {
  enqueueOutboundEmail,
  isOutboundEmailAsyncEnabled,
} from "@/lib/messaging/enqueue-outbound-email";
import { recordEmailSendFailure } from "@/lib/messaging/provider-send-failures";
import {
  markAgentMessageSendFailed,
  markPendingAgentMessageSendUnknown,
} from "@/lib/messaging/dispatch-message-common";
import { captureDashboardOutboundReplySent } from "@/lib/server/product-analytics";
import { toolError, toolEscalated, toolNotFound, toolOk, toolUnknown, type ReceiptV1, type ToolResult } from "@shopkeeper/agent/tools";
import type {
  AddInternalNoteInput,
  AskOperatorInput,
  SendReplyInput,
  SendEmailInput,
  UpdateThreadStatusInput,
  UpdateThreadTagInput,
  EscalateToHumanInput,
} from "@shopkeeper/agent/tools";
import type { AgentActionMode } from "@shopkeeper/agent/context";
import type { ReplySource } from "@shopkeeper/analytics";

interface ThreadContext {
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
  ctx: ThreadContext,
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

type CommunicationTool = 'send_reply' | 'send_email';

function communicationFailure(
  ctx: ThreadContext,
  tool: CommunicationTool,
  target: { kind: 'thread' | 'email'; id: string },
  outcome: 'failed' | 'not_found' | 'unknown',
  code: string,
  message: string,
): ToolResult {
  const result = outcome === 'unknown'
    ? toolUnknown(message)
    : outcome === 'not_found'
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

function communicationSuccess(
  ctx: ThreadContext,
  tool: CommunicationTool,
  args: {
    threadId: string;
    destination: { kind: 'thread' | 'email'; id: string };
    text: string;
    message: { id: string; sendStatus?: string | null; providerMessageId?: string | null };
    deliveryState?: 'accepted' | 'sent' | 'delivered';
  },
  display: string,
): ToolResult {
  const result = toolOk(display);
  if (!ctx.operationId || !ctx.executionId) return result;
  const deliveryState = args.deliveryState
    ?? (args.message.sendStatus === 'pending' || args.message.sendStatus === 'processing' ? 'accepted' : 'sent');
  return {
    ...result,
    receipt: {
      version: 1,
      operationId: ctx.operationId,
      executionId: ctx.executionId,
      tool,
      target: { kind: 'thread', id: args.threadId },
      observedAt: new Date().toISOString(),
      providerReference: args.message.id,
      outcome: 'succeeded',
      facts: {
        logicalResponseId: args.message.id,
        messageId: args.message.id,
        threadId: args.threadId,
        destination: args.destination,
        contentSha256: createHash('sha256').update(args.text).digest('hex'),
        deliveryState,
        providerMessageId: args.message.providerMessageId ?? null,
      },
    },
  };
}

function agentReplySource(mode: AgentActionMode | undefined): ReplySource {
  return mode === 'auto_executed' ? 'agent_automatic' : 'agent_approved';
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

// ── add_internal_note ─────────────────────────────────────────────────────────

export async function addInternalNote(
  input: AddInternalNoteInput,
  ctx: ThreadContext
): Promise<ToolResult> {
  const owned = await db.thread.findFirst({
    where: { id: ctx.threadId, organizationId: ctx.orgId },
    select: { id: true },
  });
  if (!owned) return toolNotFound("Error: thread not found.");
  const message = await createMessage({
    threadId: ctx.threadId,
    organizationId: ctx.orgId,
    senderType: SenderType.note,
    contentText: `${AGENT_NOTE_PREFIX}${input.text}`,
  });
  const result = toolOk(`Note logged: "${input.text}"`);
  const receipt = successfulThreadReceipt(ctx, 'add_internal_note', message.id, {
    threadId: ctx.threadId,
    messageId: message.id,
    contentSha256: createHash('sha256').update(input.text).digest('hex'),
  });
  return receipt ? { ...result, receipt } : result;
}

// ── send_reply ────────────────────────────────────────────────────────────────

export async function sendReply(
  input: SendReplyInput,
  ctx: ThreadContext
): Promise<ToolResult> {
  const thread = await db.thread.findFirst({
    where: { id: ctx.threadId, organizationId: ctx.orgId },
    include: { customer: true },
  }).catch(() => null);

  if (!thread) return communicationFailure(ctx, 'send_reply', { kind: 'thread', id: ctx.threadId }, 'not_found', 'thread_not_found', "Error: thread not found.");
  if (
    thread.channelType !== CHANNEL_TYPE.IG_DM &&
    thread.channelType !== CHANNEL_TYPE.TIKTOK &&
    thread.channelType !== CHANNEL_TYPE.EMAIL &&
    thread.channelType !== CHANNEL_TYPE.SHOPIFY_CHAT
  ) {
    return communicationFailure(ctx, 'send_reply', { kind: 'thread', id: ctx.threadId }, 'failed', 'unsupported_channel', `Error: channel dispatch not implemented for ${thread.channelType}.`);
  }

  const result = await dispatchMessage(
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

// ── send_email ────────────────────────────────────────────────────────────────

export async function sendEmail(
  input: SendEmailInput,
  ctx: ThreadContext
): Promise<ToolResult> {
  // Fetch email integration; simultaneously search for an existing open email thread
  // for this recipient directly via relation filter (avoids a separate customer lookup
  // that can miss if the address casing differs from the stored platformId).
  const [emailIntegrationResult, existingThread] = await Promise.all([
    resolveEmailIntegration({ organizationId: ctx.orgId, purpose: "proactive" })
      .then(integration => ({ integration }))
      .catch(error => ({ error })),
    db.thread.findFirst({
      where: {
        organizationId: ctx.orgId,
        channelType: CHANNEL_TYPE.EMAIL,
        status: THREAD_STATUS.OPEN,
        customer: { platformId: { equals: input.to, mode: "insensitive" } },
      },
      include: { customer: true },
      orderBy: { updatedAt: "desc" },
    }),
  ]);
  if ('error' in emailIntegrationResult) {
    const error = emailIntegrationResult.error;
    if (error instanceof EmailNotConfiguredError) {
      return communicationFailure(ctx, 'send_email', { kind: 'email', id: input.to }, 'failed', 'email_not_configured', `Error: email not configured — ${error.message}`);
    }
    return communicationFailure(ctx, 'send_email', { kind: 'email', id: input.to }, 'failed', 'integration_lookup_failed', `Error: email integration lookup failed — ${error instanceof Error ? error.message : String(error)}`);
  }
  const emailIntegration = emailIntegrationResult.integration;

  const fromEmail = emailIntegration.fromEmail || emailIntegration.externalAccountId;
  const provider = getEmailProvider(emailIntegration);

  // For a new thread we need the ID for email headers before calling the provider.
  // Create the thread shell now (no message) so we can roll back if send fails.
  let targetThreadId: string;
  if (existingThread) {
    targetThreadId = existingThread.id;
  } else {
    // No existing thread — upsert the customer then create a new thread shell
    const customerKey = { organizationId: ctx.orgId, platformId: input.to };
    let customer = await db.customer.findUnique({ where: { organizationId_platformId: customerKey } });
    if (!customer) {
      try {
        customer = await db.customer.create({ data: { organizationId: ctx.orgId, platformId: input.to } });
      } catch (err) {
        if ((err as { code?: string }).code !== 'P2002') throw err;
        customer = (await db.customer.findUnique({ where: { organizationId_platformId: customerKey } }))!;
      }
    }
    const newThread = await db.thread.create({
      data: {
        organizationId: ctx.orgId,
        customerId: customer.id,
        channelType: CHANNEL_TYPE.EMAIL,
        status: THREAD_STATUS.OPEN,
        subject: input.subject,
        tag: input.subject,
      },
    });
    targetThreadId = newThread.id;
  }

  // Async path (OUTBOUND_EMAIL_ASYNC): pre-create the agent message as `pending`
  // and hand the provider send to the gateway queue. The thread stores
  // input.subject so the worker derives the outbound subject; the message row's
  // sendStatus is the source of truth (retryable on failure).
  if (isOutboundEmailAsyncEnabled()) {
    const message = await createMessage(
      {
        threadId: targetThreadId,
        organizationId: ctx.orgId,
        senderType: SenderType.agent,
        contentText: input.body,
        sendStatus: 'pending',
        integrationId: emailIntegration.id,
      },
      { status: THREAD_STATUS.OPEN },
    );
    const enqueued = await enqueueOutboundEmail({
      organizationId: ctx.orgId,
      messageId: message.id,
      threadId: targetThreadId,
      integrationId: emailIntegration.id,
      replySource: agentReplySource(ctx.agentActionMode),
      source: 'agent_send_email',
    });
    if (enqueued === 'failed') {
      await markAgentMessageSendFailed(message.id, 'Could not queue email send');
      return communicationFailure(ctx, 'send_email', { kind: 'thread', id: targetThreadId }, 'failed', 'queue_failed', 'Error: could not queue email send.');
    }
    if (enqueued === 'unknown') {
      await markPendingAgentMessageSendUnknown(
        message.id,
        'Email queue admission outcome unknown',
      );
      const failure = communicationFailure(ctx, 'send_email', { kind: 'thread', id: targetThreadId }, 'unknown', 'queue_admission_unknown', 'Unknown: email queue admission could not be confirmed. Do not send it again automatically.');
      if (!failure.receipt || !ctx.operationId || !ctx.executionId) return failure;
      return {
        ...failure,
        receipt: {
          version: 1,
          operationId: ctx.operationId,
          executionId: ctx.executionId,
          tool: 'send_email',
          target: { kind: 'thread', id: targetThreadId },
          observedAt: new Date().toISOString(),
          providerReference: message.id,
          outcome: 'unknown',
          code: 'queue_admission_unknown',
          facts: {
            logicalResponseId: message.id,
            messageId: message.id,
            threadId: targetThreadId,
            destination: { kind: 'email', id: input.to },
            contentSha256: createHash('sha256').update(input.body).digest('hex'),
            deliveryState: 'unknown',
            providerMessageId: null,
          },
        },
      };
    }
    return communicationSuccess(
      ctx,
      'send_email',
      { threadId: targetThreadId, destination: { kind: 'email', id: input.to }, text: input.body, message, deliveryState: 'accepted' },
      existingThread
        ? `Email queued to ${input.to} via their existing open ticket.`
        : `Email queued to ${input.to} and a new ticket was opened.`,
    );
  }

  const subject = existingThread ? formatReplySubject(input.subject) : input.subject;
  const headers = buildThreadReplyHeaders(targetThreadId);
  const pendingMessage = await createMessage({
    threadId: targetThreadId,
    organizationId: ctx.orgId,
    senderType: SenderType.agent,
    contentText: input.body,
    sendStatus: 'pending',
    integrationId: emailIntegration.id,
  });
  const recorded = await recordOutboundCall({
    source: "agent_send_email",
    provider,
    channel: "email",
    organizationId: ctx.orgId,
    threadId: targetThreadId,
    to: input.to,
    from: fromEmail,
    subject,
    text: input.body,
    headers,
    metadata: { replyTo: emailIntegration.externalAccountId },
  });

  logger.info({ to: input.to, existingThreadId: existingThread?.id ?? null, targetThreadId }, '[sendEmail]');
  try {
    if (!recorded) {
      await getEmailSender(emailIntegration).send({
        to: input.to,
        fromAddress: fromEmail,
        fromName: ctx.orgName,
        replyTo: emailIntegration.externalAccountId,
        subject,
        text: input.body,
        headers,
      });
    }
    logger.info({ threadId: targetThreadId, provider }, '[sendEmail] Provider accepted');
  } catch (err) {
    if (err instanceof EmailNotConfiguredError) {
      await markAgentMessageSendFailed(pendingMessage.id, err.message);
      return communicationFailure(ctx, 'send_email', { kind: 'thread', id: targetThreadId }, 'failed', 'email_not_configured', `Error: email not configured — ${err.message}`);
    }
    const msg = err instanceof Error ? err.message : String(err);
    await markPendingAgentMessageSendUnknown(pendingMessage.id, msg);
    logger.error({ err: msg, threadId: targetThreadId, provider }, '[sendEmail] Email dispatch error');
    await recordEmailSendFailure({
      provider,
      organizationId: ctx.orgId,
      threadId: targetThreadId,
      integrationId: emailIntegration.id,
      detail: msg,
    });
    return communicationFailure(ctx, 'send_email', { kind: 'thread', id: targetThreadId }, 'unknown', 'provider_outcome_unknown', `Unknown: email dispatch may have completed — ${msg}. Do not send it again automatically.`);
  }

  // Send confirmed — settle the same response record that existed before dispatch.
  const sentMessage = await db.message.update({
    where: { id: pendingMessage.id },
    data: { sendStatus: 'sent', sendError: null },
  });
  void captureDashboardOutboundReplySent({
    channel: CHANNEL_TYPE.EMAIL,
    messageId: sentMessage.id,
    organizationId: ctx.orgId,
    replySource: agentReplySource(ctx.agentActionMode),
  });

  return communicationSuccess(
    ctx,
    'send_email',
    { threadId: targetThreadId, destination: { kind: 'email', id: input.to }, text: input.body, message: sentMessage, deliveryState: 'sent' },
    existingThread
      ? `Email sent to ${input.to} via their existing open ticket.`
      : `Email sent to ${input.to} and a new ticket was opened.`,
  );
}

// ── update_thread_status ──────────────────────────────────────────────────────

export async function updateThreadStatus(
  input: UpdateThreadStatusInput,
  ctx: ThreadContext
): Promise<ToolResult> {
  const observed = await db.$transaction(async tx => {
    const before = await tx.thread.findFirst({
      where: { id: ctx.threadId, organizationId: ctx.orgId }, select: { status: true },
    });
    if (!before) return null;
    const after = await tx.thread.update({
      where: { id: ctx.threadId }, data: { status: input.status }, select: { status: true },
    });
    return { before: before.status, after: after.status };
  });
  if (!observed) return toolNotFound("Error: thread not found.");
  const result = toolOk(`Thread status updated to "${observed.after}".`);
  const receipt = successfulThreadReceipt(ctx, 'update_thread_status', ctx.threadId, {
    threadId: ctx.threadId, beforeStatus: observed.before, afterStatus: observed.after,
  });
  return receipt ? { ...result, receipt } : result;
}

// ── update_thread_tag ─────────────────────────────────────────────────────────

export async function updateThreadTag(
  input: UpdateThreadTagInput,
  ctx: ThreadContext
): Promise<ToolResult> {
  const observed = await db.$transaction(async tx => {
    const before = await tx.thread.findFirst({
      where: { id: ctx.threadId, organizationId: ctx.orgId }, select: { tag: true },
    });
    if (!before) return null;
    const after = await tx.thread.update({
      where: { id: ctx.threadId }, data: { tag: input.tag }, select: { tag: true },
    });
    return { before: before.tag, after: after.tag };
  });
  if (!observed) return toolNotFound("Error: thread not found.");
  const result = toolOk(`Thread tag updated to "${observed.after}".`);
  const receipt = successfulThreadReceipt(ctx, 'update_thread_tag', ctx.threadId, {
    threadId: ctx.threadId, beforeTag: observed.before, afterTag: observed.after,
  });
  return receipt ? { ...result, receipt } : result;
}

// ── escalate_to_human ─────────────────────────────────────────────────────────

async function notifyGatewayOfEscalation(args: {
  organizationId: string;
  threadId: string;
  reason: string;
}): Promise<void> {
  const base = getGatewayBaseUrl();
  if (!base) {
    logger.warn({ threadId: args.threadId }, '[escalateToHuman] No gateway base URL — skipping operator push');
    return;
  }
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) {
    logger.warn({ threadId: args.threadId }, '[escalateToHuman] INTERNAL_API_SECRET unset — skipping operator push');
    return;
  }
  try {
    const res = await fetchProviderWithDeadline(`${base}/internal/operator/escalate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': secret,
      },
      body: JSON.stringify(args),
    }, {
      provider: 'gateway',
      operation: 'operator escalation notification',
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      logger.warn(
        { status: res.status, threadId: args.threadId, body: body.slice(0, 300) },
        '[escalateToHuman] Gateway escalation push failed',
      );
    }
  } catch (err) {
    logger.warn(
      { err: (err as Error).message, threadId: args.threadId },
      '[escalateToHuman] Gateway escalation push errored',
    );
  }
}

export async function escalateToHuman(
  input: EscalateToHumanInput,
  ctx: ThreadContext
): Promise<ToolResult> {
  const reason = input.reason.trim() || "No reason provided";
  // P5-04: keep the ticket `open` so it stays in the inbox and inbound
  // follow-ups correlate to it; escalation rides on the orthogonal flag.
  const updated = await db.thread.updateMany({
    where: { id: ctx.threadId, organizationId: ctx.orgId },
    data: { status: THREAD_STATUS.OPEN, tag: "needs_human", escalatedAt: new Date() },
  });
  if (updated.count !== 1) return toolError("Error: thread not found.");
  await createMessage({
    threadId: ctx.threadId,
    organizationId: ctx.orgId,
    senderType: SenderType.note,
    contentText: `${AGENT_NOTE_PREFIX}Escalated to merchant: ${reason}`,
  });
  void notifyGatewayOfEscalation({
    organizationId: ctx.orgId,
    threadId: ctx.threadId,
    reason,
  });
  return toolEscalated(reason);
}

// ── ask_operator ──────────────────────────────────────────────────────────────

// Soft sibling of escalateToHuman: the agent needs one fact/decision from the
// merchant to finish the ticket. Unlike escalation it does not park the thread —
// the question rides in the cached plan and surfaces as `needs_merchant_input`.
// This sink only runs if an ask_operator plan is executed, which it never is
// (classification surfaces the question instead), so the operator push lives in
// the gateway operator-notification path, not here. We record a note for the audit trail.
export async function askOperator(
  input: AskOperatorInput,
  ctx: ThreadContext
): Promise<ToolResult> {
  const question = input.question.trim() || "No question provided";
  const owned = await db.thread.findFirst({
    where: { id: ctx.threadId, organizationId: ctx.orgId },
    select: { id: true },
  });
  if (!owned) return toolError("Error: thread not found.");
  await createMessage({
    threadId: ctx.threadId,
    organizationId: ctx.orgId,
    senderType: SenderType.note,
    contentText: `${AGENT_NOTE_PREFIX}Asked the merchant: ${question}`,
  });
  return toolOk(question);
}

import { db, SenderType, createMessage } from "@shopkeeper/db";
import { AGENT_NOTE_PREFIX, CHANNEL_TYPE, THREAD_STATUS } from "@shopkeeper/agent/thread-constants";
import { recordOutboundCall } from "@/lib/server/outbound-recorder";
import logger from "@/lib/server/logger";
import { getGatewayBaseUrl } from "@/lib/server/gateway-url";
import { getEmailProvider } from "@shopkeeper/email/providers";
import { buildThreadReplyHeaders, formatReplySubject } from "@shopkeeper/email/reply";
import { getEmailSender } from "@shopkeeper/email/senders";
import { EmailNotConfiguredError } from "@shopkeeper/email/types";
import { dispatchMessage, type DispatchMessageResult } from "@/lib/messaging/dispatch-message";
import {
  enqueueOutboundEmail,
  isOutboundEmailAsyncEnabled,
} from "@/lib/messaging/enqueue-outbound-email";
import { recordEmailSendFailure } from "@/lib/messaging/provider-send-failures";
import { captureDashboardOutboundReplySent } from "@/lib/server/product-analytics";
import { toolError, toolEscalated, toolOk, type ToolResult } from "@shopkeeper/agent/tools";
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
}

function agentReplySource(mode: AgentActionMode | undefined): ReplySource {
  return mode === 'auto_executed' ? 'agent_automatic' : 'agent_approved';
}

function agentReplyDispatchError(
  channelType: string,
  result: Extract<DispatchMessageResult, { ok: false }>,
): ToolResult {
  if (channelType === CHANNEL_TYPE.IG_DM && result.providerStatus !== undefined) {
    return toolError(`Error: Instagram dispatch failed (${result.providerStatus}).`);
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
    "No iMessage integration configured": "no iMessage integration configured",
    "No inbound iMessage conversation to reply into":
      "can't reply on iMessage — the customer must message first (no open iMessage conversation to reply into)",
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
  await createMessage({
    threadId: ctx.threadId,
    senderType: SenderType.note,
    contentText: `${AGENT_NOTE_PREFIX}${input.text}`,
  });
  return toolOk(`Note logged: "${input.text}"`);
}

// ── send_reply ────────────────────────────────────────────────────────────────

export async function sendReply(
  input: SendReplyInput,
  ctx: ThreadContext
): Promise<ToolResult> {
  const thread = await db.thread.findUnique({
    where: { id: ctx.threadId },
    include: { customer: true },
  }).catch(() => null);

  if (!thread) return toolError("Error: thread not found.");
  if (
    thread.channelType !== CHANNEL_TYPE.IG_DM &&
    thread.channelType !== CHANNEL_TYPE.TIKTOK &&
    thread.channelType !== CHANNEL_TYPE.EMAIL &&
    thread.channelType !== CHANNEL_TYPE.IMESSAGE
  ) {
    return toolError(`Error: channel dispatch not implemented for ${thread.channelType}.`);
  }

  const result = await dispatchMessage(
    thread,
    { id: ctx.orgId, name: ctx.orgName },
    input.text,
    {
      source: "agent_send_reply",
      analyticsReplySource: agentReplySource(ctx.agentActionMode),
      emailSubjectFallback: thread.tag || "Your inquiry",
    },
  );
  if (!result.ok) return agentReplyDispatchError(thread.channelType, result);

  if (thread.channelType === CHANNEL_TYPE.IG_DM) {
    return toolOk(`Reply sent to customer via Instagram DM.`);
  }
  if (thread.channelType === CHANNEL_TYPE.TIKTOK) {
    return toolOk(`Reply sent to customer via TikTok Shop.`);
  }
  // iMessage has no delivery confirmation — the send is queued, not confirmed
  // delivered. Say "queued" so the agent never implies delivery certainty.
  if (thread.channelType === CHANNEL_TYPE.IMESSAGE) {
    return toolOk(`Reply queued to customer via iMessage.`);
  }
  return toolOk(`Reply sent to customer via email.`);
}

// ── send_email ────────────────────────────────────────────────────────────────

export async function sendEmail(
  input: SendEmailInput,
  ctx: ThreadContext
): Promise<ToolResult> {
  // Fetch email integration; simultaneously search for an existing open email thread
  // for this recipient directly via relation filter (avoids a separate customer lookup
  // that can miss if the address casing differs from the stored platformId).
  const [emailIntegration, existingThread] = await Promise.all([
    db.integration.findFirst({ where: { organizationId: ctx.orgId, platform: CHANNEL_TYPE.EMAIL } }),
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
  if (!emailIntegration) return toolError("Error: no email integration connected.");

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
        senderType: SenderType.agent,
        contentText: input.body,
        sendStatus: 'pending',
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
    if (!enqueued) {
      await db.message.update({
        where: { id: message.id },
        data: { sendStatus: 'failed', sendError: 'Could not queue email send' },
      });
      return toolError('Error: could not queue email send.');
    }
    return toolOk(existingThread
      ? `Email queued to ${input.to} via their existing open ticket.`
      : `Email queued to ${input.to} and a new ticket was opened.`);
  }

  const subject = existingThread ? formatReplySubject(input.subject) : input.subject;
  const headers = buildThreadReplyHeaders(targetThreadId);
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
    // Provider failed — archive the thread shell if we just created it.
    if (!existingThread) {
      await db.thread.update({ where: { id: targetThreadId }, data: { archivedAt: new Date() } }).catch(() => {});
    }
    if (err instanceof EmailNotConfiguredError) return toolError(`Error: email not configured — ${err.message}`);
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err: msg, threadId: targetThreadId, provider }, '[sendEmail] Email dispatch error');
    await recordEmailSendFailure({
      provider,
      organizationId: ctx.orgId,
      threadId: targetThreadId,
      integrationId: emailIntegration.id,
      detail: msg,
    });
    return toolError(`Error: email dispatch failed — ${msg}`);
  }

  // Send confirmed — persist the message
  const sentMessage = await createMessage({
    threadId: targetThreadId,
    senderType: SenderType.agent,
    contentText: input.body,
  });
  void captureDashboardOutboundReplySent({
    channel: CHANNEL_TYPE.EMAIL,
    messageId: sentMessage.id,
    organizationId: ctx.orgId,
    replySource: agentReplySource(ctx.agentActionMode),
  });

  return toolOk(existingThread
    ? `Email sent to ${input.to} via their existing open ticket.`
    : `Email sent to ${input.to} and a new ticket was opened.`);
}

// ── update_thread_status ──────────────────────────────────────────────────────

export async function updateThreadStatus(
  input: UpdateThreadStatusInput,
  ctx: ThreadContext
): Promise<ToolResult> {
  await db.thread.update({
    where: { id: ctx.threadId },
    data: { status: input.status },
  });
  return toolOk(`Thread status updated to "${input.status}".`);
}

// ── update_thread_tag ─────────────────────────────────────────────────────────

export async function updateThreadTag(
  input: UpdateThreadTagInput,
  ctx: ThreadContext
): Promise<ToolResult> {
  await db.thread.update({
    where: { id: ctx.threadId },
    data: { tag: input.tag },
  });
  return toolOk(`Thread tag updated to "${input.tag}".`);
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
    const res = await fetch(`${base}/internal/operator/escalate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': secret,
      },
      body: JSON.stringify(args),
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
  await db.thread.update({
    where: { id: ctx.threadId },
    data: { status: THREAD_STATUS.PENDING, tag: "needs_human" },
  });
  await createMessage({
    threadId: ctx.threadId,
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
// (classification surfaces the question instead), so the Telegram push lives in
// the gateway operator-notification path, not here. We record a note for the audit trail.
export async function askOperator(
  input: AskOperatorInput,
  ctx: ThreadContext
): Promise<ToolResult> {
  const question = input.question.trim() || "No question provided";
  await createMessage({
    threadId: ctx.threadId,
    senderType: SenderType.note,
    contentText: `${AGENT_NOTE_PREFIX}Asked the merchant: ${question}`,
  });
  return toolOk(question);
}

import { createHash } from "node:crypto";
import { SenderType, createMessage } from "@shopkeeper/db";
import { CHANNEL_TYPE, THREAD_STATUS } from "@shopkeeper/agent/thread-constants";
import { communicationFailure, communicationSuccess, openEmailThreadFor, type ThreadSinkContext } from "@shopkeeper/agent/thread-io";
import type { SendReplyInput, SendEmailInput } from "@shopkeeper/agent/tools";
import type { ToolResult } from "@shopkeeper/agent/tools";
import {
  agentReplySource,
  loadAgentReplyThread,
  markAgentMessageSendFailed,
  markLogicalResponseAttempted,
  markLogicalResponseSent,
  markPendingAgentMessageSendUnknown,
  recordOutboundCall,
  sendAgentReply,
} from "@shopkeeper/messaging";
import logger from "@/lib/server/logger";
import { getEmailProvider } from "@shopkeeper/email/providers";
import { buildThreadReplyHeaders, formatReplySubject } from "@shopkeeper/email/reply";
import { getEmailSender } from "@shopkeeper/email/senders";
import { EmailNotConfiguredError } from "@shopkeeper/email/types";
import { resolveEmailIntegration } from "@shopkeeper/email/integration-resolution";
import { dispatchMessage } from "@/lib/messaging/dispatch-message";
import {
  enqueueOutboundEmail,
  isOutboundEmailAsyncEnabled,
} from "@/lib/messaging/enqueue-outbound-email";
import { recordEmailSendFailure } from "@/lib/messaging/provider-send-failures";
import { captureDashboardOutboundReplySent } from "@/lib/server/product-analytics";

type ThreadContext = ThreadSinkContext;

// ── send_reply ────────────────────────────────────────────────────────────────

export async function sendReply(
  input: SendReplyInput,
  ctx: ThreadContext
): Promise<ToolResult> {
  return sendAgentReply(input, ctx, await loadAgentReplyThread(ctx), dispatchMessage);
}

// ── send_email ────────────────────────────────────────────────────────────────

export async function sendEmail(
  input: SendEmailInput,
  ctx: ThreadContext
): Promise<ToolResult> {
  const emailIntegrationResult = await resolveEmailIntegration({ organizationId: ctx.orgId, purpose: "proactive" })
    .then(integration => ({ integration }))
    .catch(error => ({ error }));
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

  // An approved draft runs on the ticket it was reviewed on. The ID goes into
  // the email headers, so a new ticket is opened before the provider is called.
  const target = await openEmailThreadFor({
    organizationId: ctx.orgId, to: input.to, subject: input.subject, preferThreadId: ctx.threadId,
  });
  const targetThreadId = target.id;
  const existingThread = target.replying ? target : null;
  // The message records the request and task it answers, as a reply's does.
  const attribution = {
    ...(ctx.agentRequestId ? { agentRequestId: ctx.agentRequestId } : {}),
    ...(ctx.agentTaskId ? { agentTaskId: ctx.agentTaskId } : {}),
  };

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
        ...attribution,
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
    ...attribution,
  });
  await markLogicalResponseAttempted(pendingMessage.id);
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
  // The provider's id for this send; undefined when the call was only recorded.
  let providerMessageId: string | undefined;
  try {
    if (!recorded) {
      ({ providerMessageId } = await getEmailSender(emailIntegration).send({
        to: input.to,
        fromAddress: fromEmail,
        fromName: ctx.orgName,
        replyTo: emailIntegration.externalAccountId,
        subject,
        text: input.body,
        headers,
      }));
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
  const sentMessage = await markLogicalResponseSent(pendingMessage.id, emailIntegration.id, providerMessageId);
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

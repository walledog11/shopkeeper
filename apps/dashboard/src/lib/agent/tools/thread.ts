import { db, SenderType, createMessage } from "@clerk/db";
import { AGENT_NOTE_PREFIX, CHANNEL_TYPE, THREAD_STATUS, isOperatorChannel } from "@/lib/messaging/thread-constants";
import { recordOutboundCall } from "@/lib/server/outbound-recorder";
import logger from "@/lib/server/logger";
import { recordProviderSendFailure } from "@/lib/server/provider-send-alerts";
import { getRedis } from "@/lib/server/redis";
import { getGatewayBaseUrl } from "@/lib/server/gateway-url";
import { enqueueCustomerMemoryForClosedThreads } from "@/lib/server/customer-memory";
import { EmailNotConfiguredError, getEmailProvider, getEmailSender } from "@/lib/messaging/email";
import { toolError, toolEscalated, toolOk, type ToolResult } from "./result";
import type {
  AddInternalNoteInput,
  SendReplyInput,
  SendEmailInput,
  UpdateThreadStatusInput,
  UpdateThreadTagInput,
  EscalateToHumanInput,
} from "./registry";

interface ThreadContext {
  threadId: string;
  orgId: string;
  orgName: string;
}

function replySubject(subject: string | null | undefined, fallback = "Your inquiry"): string {
  const raw = subject?.trim() || fallback;
  return /^re:\s/i.test(raw) ? raw : `Re: ${raw}`;
}

function threadMessageId(threadId: string): string {
  const inboundDomain = process.env.INBOUND_EMAIL_DOMAIN || "mail.clerkapp.com";
  return `<thread-${threadId}@${inboundDomain}>`;
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
  const thread = await db.thread.update({
    where: { id: ctx.threadId },
    data: { status: "open" },
    include: { customer: true },
  }).catch(() => null);

  if (!thread) return toolError("Error: thread not found.");

  const recipientId = thread.customer.platformId;

  // ── Instagram dispatch ──
  if (thread.channelType === CHANNEL_TYPE.IG_DM) {
    const igIntegration = await db.integration.findFirst({
      where: { organizationId: ctx.orgId, platform: CHANNEL_TYPE.IG_DM },
    });
    if (!igIntegration?.externalAccountId) {
      return toolError("Error: no Instagram integration configured.");
    }
    const recorded = await recordOutboundCall({
      source: "agent_send_reply",
      provider: "meta",
      channel: "ig_dm",
      organizationId: ctx.orgId,
      threadId: ctx.threadId,
      to: recipientId,
      from: igIntegration.externalAccountId,
      text: input.text,
      metadata: { igAccountId: igIntegration.externalAccountId },
    });
    if (!recorded) {
      if (!igIntegration.accessToken) return toolError("Error: no Instagram integration configured.");
      const igRes = await fetch(
        `https://graph.facebook.com/v22.0/${igIntegration.externalAccountId}/messages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${igIntegration.accessToken}`,
          },
          body: JSON.stringify({
            recipient: { id: recipientId },
            message: { text: input.text },
          }),
        }
      );
      if (!igRes.ok) {
        const errBody = await igRes.text().catch(() => "");
        logger.error({ status: igRes.status, body: errBody }, '[sendReply] Instagram dispatch error');
        void recordProviderSendFailure('meta', 'ig_dm', ctx.orgId, {
          counterClient: getRedis(),
          threadId: ctx.threadId,
          integrationId: igIntegration.id,
          detail: `Instagram dispatch failed (${igRes.status})`,
        });
        return toolError(`Error: Instagram dispatch failed (${igRes.status}).`);
      }
    }
    await createMessage({
      threadId: ctx.threadId,
      senderType: SenderType.agent,
      contentText: input.text,
    });
    return toolOk(`Reply sent to customer via Instagram DM.`);
  }

  // ── Email dispatch ──
  if (thread.channelType === CHANNEL_TYPE.EMAIL) {
    const emailIntegration = await db.integration.findFirst({
      where: { organizationId: ctx.orgId, platform: CHANNEL_TYPE.EMAIL },
    });
    if (!emailIntegration) return toolError("Error: no email integration configured.");
    const fromEmail = emailIntegration.fromEmail || emailIntegration.externalAccountId;
    const syntheticMessageId = threadMessageId(ctx.threadId);
    const lastCustomerMsg = await db.message.findFirst({
      where: { threadId: ctx.threadId, senderType: SenderType.customer, externalMessageId: { not: null } },
      orderBy: { sentAt: "desc" },
      select: { externalMessageId: true },
    });
    const inReplyTo = lastCustomerMsg?.externalMessageId ?? syntheticMessageId;
    const headers = [
      { name: "Message-ID", value: syntheticMessageId },
      { name: "In-Reply-To", value: inReplyTo },
      { name: "References", value: inReplyTo },
    ];
    const provider = getEmailProvider(emailIntegration);
    const subject = replySubject(thread.subject, thread.tag || "Your inquiry");
    const recorded = await recordOutboundCall({
      source: "agent_send_reply",
      provider,
      channel: "email",
      organizationId: ctx.orgId,
      threadId: ctx.threadId,
      to: recipientId,
      from: fromEmail,
      subject,
      text: input.text,
      headers,
      metadata: { replyTo: emailIntegration.externalAccountId },
    });
    try {
      if (!recorded) {
        await getEmailSender(emailIntegration).send({
          to: recipientId,
          fromAddress: fromEmail,
          fromName: ctx.orgName,
          replyTo: emailIntegration.externalAccountId,
          subject,
          text: input.text,
          headers,
        });
      }
    } catch (err) {
      if (err instanceof EmailNotConfiguredError) return toolError(`Error: email not configured , ${err.message}`);
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err: msg, provider }, '[sendReply] Email dispatch error');
      void recordProviderSendFailure(provider, 'email', ctx.orgId, {
        counterClient: getRedis(),
        threadId: ctx.threadId,
        integrationId: emailIntegration.id,
        detail: msg,
      });
      return toolError(`Error: email dispatch failed , ${msg}`);
    }
    await createMessage({
      threadId: ctx.threadId,
      senderType: SenderType.agent,
      contentText: input.text,
    });
    return toolOk(`Reply sent to customer via email.`);
  }

  return toolError(`Error: channel dispatch not implemented for ${thread.channelType}.`);
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
    // No existing thread , upsert the customer then create a new thread shell
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
        tag: input.subject,
      },
    });
    targetThreadId = newThread.id;
  }

  const subject = existingThread ? replySubject(input.subject) : input.subject;
  const syntheticMessageId = threadMessageId(targetThreadId);
  const headers = [
    { name: "Message-ID", value: syntheticMessageId },
    { name: "In-Reply-To", value: syntheticMessageId },
    { name: "References", value: syntheticMessageId },
  ];
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
    // Provider failed , archive the thread shell if we just created it.
    if (!existingThread) {
      await db.thread.update({ where: { id: targetThreadId }, data: { archivedAt: new Date() } }).catch(() => {});
    }
    if (err instanceof EmailNotConfiguredError) return toolError(`Error: email not configured , ${err.message}`);
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err: msg, threadId: targetThreadId, provider }, '[sendEmail] Email dispatch error');
    void recordProviderSendFailure(provider, 'email', ctx.orgId, {
      counterClient: getRedis(),
      threadId: targetThreadId,
      integrationId: emailIntegration.id,
      detail: msg,
    });
    return toolError(`Error: email dispatch failed , ${msg}`);
  }

  // Send confirmed , persist the message
  await createMessage({
    threadId: targetThreadId,
    senderType: SenderType.agent,
    contentText: input.body,
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
  const updated = await db.thread.update({
    where: { id: ctx.threadId },
    data: { status: input.status },
    select: { updatedAt: true, channelType: true },
  });
  if (input.status === THREAD_STATUS.CLOSED && !isOperatorChannel(updated.channelType)) {
    await enqueueCustomerMemoryForClosedThreads({
      organizationId: ctx.orgId,
      threads: [{ threadId: ctx.threadId, closedAt: updated.updatedAt }],
    });
  }
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
    logger.warn({ threadId: args.threadId }, '[escalateToHuman] No gateway base URL , skipping operator push');
    return;
  }
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) {
    logger.warn({ threadId: args.threadId }, '[escalateToHuman] INTERNAL_API_SECRET unset , skipping operator push');
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

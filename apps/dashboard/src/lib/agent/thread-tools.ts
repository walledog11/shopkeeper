import { db, SenderType } from "@clerk/db";
import { ServerClient } from "postmark";
import twilio from "twilio";
import { AGENT_NOTE_PREFIX, CHANNEL_TYPE, THREAD_STATUS } from "../constants";
import logger from "@/lib/logger";
import type {
  AddInternalNoteInput,
  SendReplyInput,
  SendEmailInput,
  UpdateThreadStatusInput,
  UpdateThreadTagInput,
} from "./tools";

interface ThreadContext {
  threadId: string;
  orgId: string;
  orgName: string;
}

// ── add_internal_note ─────────────────────────────────────────────────────────

export async function addInternalNote(
  input: AddInternalNoteInput,
  ctx: ThreadContext
): Promise<string> {
  await db.message.create({
    data: { threadId: ctx.threadId, senderType: SenderType.note, contentText: `${AGENT_NOTE_PREFIX}${input.text}` },
  });
  return `Note logged: "${input.text}"`;
}

// ── send_reply ────────────────────────────────────────────────────────────────

export async function sendReply(
  input: SendReplyInput,
  ctx: ThreadContext
): Promise<string> {
  const thread = await db.thread.update({
    where: { id: ctx.threadId },
    data: { status: "open" },
    include: { customer: true },
  }).catch(() => null);

  if (!thread) return "Error: thread not found.";

  const recipientId = thread.customer.platformId;

  // ── Instagram dispatch ──
  if (thread.channelType === CHANNEL_TYPE.IG_DM) {
    const igIntegration = await db.integration.findFirst({
      where: { organizationId: ctx.orgId, platform: CHANNEL_TYPE.IG_DM },
    });
    if (!igIntegration?.accessToken || !igIntegration.externalAccountId) {
      return "Error: no Instagram integration configured.";
    }
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
      return `Error: Instagram dispatch failed (${igRes.status}).`;
    }
    await db.message.create({
      data: { threadId: ctx.threadId, senderType: SenderType.agent, contentText: input.text },
    });
    return `Reply sent to customer via Instagram DM.`;
  }

  // ── Email dispatch ──
  if (thread.channelType === CHANNEL_TYPE.EMAIL) {
    const POSTMARK_API_KEY = process.env.POSTMARK_API_KEY;
    if (!POSTMARK_API_KEY) return "Error: email not configured (missing POSTMARK_API_KEY).";
    const emailIntegration = await db.integration.findFirst({
      where: { organizationId: ctx.orgId, platform: CHANNEL_TYPE.EMAIL },
    });
    if (!emailIntegration) return "Error: no email integration configured.";
    const INBOUND_DOMAIN = process.env.INBOUND_EMAIL_DOMAIN || "mail.clerkapp.com";
    const fromEmail = emailIntegration.fromEmail || emailIntegration.externalAccountId;
    const client = new ServerClient(POSTMARK_API_KEY);
    const syntheticMessageId = `<thread-${ctx.threadId}@${INBOUND_DOMAIN}>`;
    const lastCustomerMsg = await db.message.findFirst({
      where: { threadId: ctx.threadId, senderType: SenderType.customer, externalMessageId: { not: null } },
      orderBy: { sentAt: "desc" },
      select: { externalMessageId: true },
    });
    const inReplyTo = lastCustomerMsg?.externalMessageId ?? syntheticMessageId;
    try {
      await client.sendEmail({
        From: `${ctx.orgName} <${fromEmail}>`,
        ReplyTo: emailIntegration.externalAccountId,
        To: recipientId,
        Subject: `Re: ${thread.tag || "Your inquiry"}`,
        TextBody: input.text,
        Headers: [
          { Name: "Message-ID",  Value: syntheticMessageId },
          { Name: "In-Reply-To", Value: inReplyTo },
          { Name: "References",  Value: inReplyTo },
        ],
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err: msg }, '[sendReply] Postmark error');
      return `Error: email dispatch failed — ${msg}`;
    }
    await db.message.create({
      data: { threadId: ctx.threadId, senderType: SenderType.agent, contentText: input.text },
    });
    return `Reply sent to customer via email.`;
  }

  // ── SMS dispatch ──
  if (thread.channelType === CHANNEL_TYPE.SMS) {
    const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
    const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
    const TWILIO_FROM_NUMBER = process.env.TWILIO_FROM_NUMBER;
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER) {
      return "Error: SMS not configured (missing Twilio env vars).";
    }
    const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
    try {
      await twilioClient.messages.create({
        body: input.text,
        from: TWILIO_FROM_NUMBER,
        to: recipientId,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err: msg }, '[sendReply] Twilio error');
      return `Error: SMS dispatch failed — ${msg}`;
    }
    await db.message.create({
      data: { threadId: ctx.threadId, senderType: SenderType.agent, contentText: input.text },
    });
    return `Reply sent to customer via SMS.`;
  }

  return `Error: channel dispatch not implemented for ${thread.channelType}.`;
}

// ── send_email ────────────────────────────────────────────────────────────────

export async function sendEmail(
  input: SendEmailInput,
  ctx: ThreadContext
): Promise<string> {
  const POSTMARK_API_KEY = process.env.POSTMARK_API_KEY;
  if (!POSTMARK_API_KEY) return "Error: email not configured (missing POSTMARK_API_KEY).";

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
  if (!emailIntegration) return "Error: no email integration connected.";

  const INBOUND_DOMAIN = process.env.INBOUND_EMAIL_DOMAIN || "mail.clerkapp.com";
  const fromEmail = emailIntegration.fromEmail || emailIntegration.externalAccountId;
  const client = new ServerClient(POSTMARK_API_KEY);

  // For a new thread we need the ID for email headers before calling Postmark.
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
        tag: input.subject,
      },
    });
    targetThreadId = newThread.id;
  }

  const subject = existingThread ? `Re: ${input.subject}` : input.subject;

  logger.info({ to: input.to, existingThreadId: existingThread?.id ?? null, targetThreadId }, '[sendEmail]');
  try {
    await client.sendEmail({
      From: `${ctx.orgName} <${fromEmail}>`,
      ReplyTo: emailIntegration.externalAccountId,
      To: input.to,
      Subject: subject,
      TextBody: input.body,
      Headers: [
        { Name: "Message-ID",  Value: `<thread-${targetThreadId}@${INBOUND_DOMAIN}>` },
        { Name: "In-Reply-To", Value: `<thread-${targetThreadId}@${INBOUND_DOMAIN}>` },
        { Name: "References",  Value: `<thread-${targetThreadId}@${INBOUND_DOMAIN}>` },
      ],
    });
    logger.info({ threadId: targetThreadId }, '[sendEmail] Postmark accepted');
  } catch (err) {
    // Postmark failed — delete the thread shell if we just created it
    if (!existingThread) {
      await db.thread.update({ where: { id: targetThreadId }, data: { archivedAt: new Date() } }).catch(() => {});
    }
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err: msg, threadId: targetThreadId }, '[sendEmail] Postmark error');
    return `Error: email dispatch failed — ${msg}`;
  }

  // Send confirmed — persist the message
  await db.message.create({
    data: { threadId: targetThreadId, senderType: SenderType.agent, contentText: input.body },
  });

  return existingThread
    ? `Email sent to ${input.to} via their existing open ticket.`
    : `Email sent to ${input.to} and a new ticket was opened.`;
}

// ── update_thread_status ──────────────────────────────────────────────────────

export async function updateThreadStatus(
  input: UpdateThreadStatusInput,
  ctx: ThreadContext
): Promise<string> {
  await db.thread.update({
    where: { id: ctx.threadId },
    data: { status: input.status },
  });
  return `Thread status updated to "${input.status}".`;
}

// ── update_thread_tag ─────────────────────────────────────────────────────────

export async function updateThreadTag(
  input: UpdateThreadTagInput,
  ctx: ThreadContext
): Promise<string> {
  await db.thread.update({
    where: { id: ctx.threadId },
    data: { tag: input.tag },
  });
  return `Thread tag updated to "${input.tag}".`;
}

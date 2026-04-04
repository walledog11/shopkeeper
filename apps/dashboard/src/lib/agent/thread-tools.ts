import { db } from "@clerk/db";
import { ServerClient } from "postmark";
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

export const AGENT_NOTE_PREFIX = "__clerk_agent_note__";

export async function addInternalNote(
  input: AddInternalNoteInput,
  ctx: ThreadContext
): Promise<string> {
  await db.message.create({
    data: { threadId: ctx.threadId, senderType: "note", contentText: `${AGENT_NOTE_PREFIX}${input.text}` },
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
    data: {
      status: "open",
      messages: {
        create: { senderType: "agent", contentText: input.text },
      },
    },
    include: { customer: true },
  });

  const recipientId = thread.customer.platformId;

  // ── Instagram dispatch ──
  if (thread.channelType === "ig_dm") {
    const igIntegration = await db.integration.findFirst({
      where: { organizationId: ctx.orgId, platform: "ig_dm" },
    });
    if (igIntegration?.accessToken && igIntegration.externalAccountId) {
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
        console.error("[sendReply] Instagram dispatch error:", igRes.status, errBody);
        return `Error: Instagram dispatch failed (${igRes.status}).`;
      }
    }
    return `Reply sent to customer via Instagram DM.`;
  }

  // ── Email dispatch ──
  if (thread.channelType === "email") {
    const POSTMARK_API_KEY = process.env.POSTMARK_API_KEY;
    if (POSTMARK_API_KEY) {
      const emailIntegration = await db.integration.findFirst({
        where: { organizationId: ctx.orgId, platform: "email" },
      });
      if (emailIntegration) {
        const INBOUND_DOMAIN = process.env.INBOUND_EMAIL_DOMAIN || "mail.clerkapp.com";
        const fromEmail = emailIntegration.fromEmail || emailIntegration.externalAccountId;
        const client = new ServerClient(POSTMARK_API_KEY);
        try {
          await client.sendEmail({
            From: `${ctx.orgName} <${fromEmail}>`,
            ReplyTo: emailIntegration.externalAccountId,
            To: recipientId,
            Subject: `Re: ${thread.tag || "Your inquiry"}`,
            TextBody: input.text,
            Headers: [
              { Name: "Message-ID",  Value: `<thread-${ctx.threadId}@${INBOUND_DOMAIN}>` },
              { Name: "In-Reply-To", Value: `<thread-${ctx.threadId}@${INBOUND_DOMAIN}>` },
              { Name: "References",  Value: `<thread-${ctx.threadId}@${INBOUND_DOMAIN}>` },
            ],
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("[sendReply] Postmark error:", msg);
          return `Error: email dispatch failed — ${msg}`;
        }
      }
    }
    return `Reply sent to customer via email.`;
  }

  return `Reply saved (channel dispatch not implemented for ${thread.channelType}).`;
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
    db.integration.findFirst({ where: { organizationId: ctx.orgId, platform: "email" } }),
    db.thread.findFirst({
      where: {
        organizationId: ctx.orgId,
        channelType: "email",
        status: "open",
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
    const customer = await db.customer.upsert({
      where: { organizationId_platformId: { organizationId: ctx.orgId, platformId: input.to } },
      update: {},
      create: { organizationId: ctx.orgId, platformId: input.to },
    });
    const newThread = await db.thread.create({
      data: {
        organizationId: ctx.orgId,
        customerId: customer.id,
        channelType: "email",
        status: "open",
        tag: input.subject,
      },
    });
    targetThreadId = newThread.id;
  }

  const subject = existingThread ? `Re: ${input.subject}` : input.subject;

  console.log(`[sendEmail] to=${input.to} existingThread=${existingThread?.id ?? "none"} targetThreadId=${targetThreadId}`);
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
    console.log(`[sendEmail] Postmark accepted — thread=${targetThreadId}`);
  } catch (err) {
    // Postmark failed — delete the thread shell if we just created it
    if (!existingThread) {
      await db.thread.delete({ where: { id: targetThreadId } }).catch(() => {});
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[sendEmail] Postmark error:`, msg);
    return `Error: email dispatch failed — ${msg}`;
  }

  // Send confirmed — persist the message
  if (existingThread) {
    await db.thread.update({
      where: { id: targetThreadId },
      data: { messages: { create: { senderType: "agent", contentText: input.body } } },
    });
  } else {
    await db.message.create({
      data: { threadId: targetThreadId, senderType: "agent", contentText: input.body },
    });
  }

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

import { db } from "@clerk/db";
import { ServerClient } from "postmark";
import type {
  AddInternalNoteInput,
  SendReplyInput,
  UpdateThreadStatusInput,
  UpdateThreadTagInput,
} from "./tools";

interface ThreadContext {
  threadId: string;
  orgId: string;
}

// ── add_internal_note ─────────────────────────────────────────────────────────

export async function addInternalNote(
  input: AddInternalNoteInput,
  ctx: ThreadContext
): Promise<string> {
  await db.message.create({
    data: { threadId: ctx.threadId, senderType: "note", contentText: input.text },
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
      await fetch(
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
        const org = await db.organization.findUnique({ where: { id: ctx.orgId } });
        const INBOUND_DOMAIN = process.env.INBOUND_EMAIL_DOMAIN || "mail.clerkapp.com";
        const fromEmail = emailIntegration.fromEmail || emailIntegration.externalAccountId;

        const client = new ServerClient(POSTMARK_API_KEY);
        try {
          await client.sendEmail({
            From: `${org?.name ?? "Support"} <${fromEmail}>`,
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

export type { ThreadContext };

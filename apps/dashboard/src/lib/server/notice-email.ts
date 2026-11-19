import { clerkClient } from "@clerk/nextjs/server"
import { AGENT_DISPLAY_NAME } from "@shopkeeper/agent/settings"
import { db } from "@shopkeeper/db"
import { PostmarkSender } from "@shopkeeper/email/senders"
import { EmailNotConfiguredError } from "@shopkeeper/email/types"
import { NotFoundError } from "@/lib/api/errors"
import { getDashboardAppUrl, getNoticeEmailFrom } from "@/lib/env"
import logger from "@/lib/server/logger"
import { getRedis } from "@/lib/server/redis"

/**
 * What a workspace with no linked phone is told by email instead of a text: a
 * plan waiting for approval, the agent's question, a conversation handed back,
 * or the briefing. The gateway decides when and writes the words; this adds
 * the link, finds the members in Clerk and sends through Postmark. The email
 * never asks for a reply: approving stays in the app.
 */
export const NOTICE_EMAIL_KINDS = ["approval", "question", "handoff", "briefing"] as const
export type NoticeEmailKind = (typeof NOTICE_EMAIL_KINDS)[number]

export interface NoticeEmail {
  orgId: string
  kind: NoticeEmailKind
  /** The conversation the email links to; null links to the dashboard home. */
  threadId: string | null
  subject: string
  /** Plain-text paragraphs. */
  paragraphs: string[]
  /** Stable per notice, so a retried job does not email a member twice. */
  idempotencyKey: string
}

export interface NoticeEmailResult {
  sent: number
  failed: number
  skipped: "not_configured" | "inactive_workspace" | "no_recipients" | null
}

// What the email asks for, on the line that carries the link.
const LINK_LABELS: Record<NoticeEmailKind, string> = {
  approval: "Review and approve it",
  question: "Answer it",
  handoff: "Open the conversation",
  briefing: "Open Shopkeeper",
}

// Long enough to cover a job's retries, as the phone path's dedupe does.
const DEDUPE_TTL_SECONDS = 60 * 60

function noticeEmailText(
  notice: Pick<NoticeEmail, "kind" | "threadId" | "paragraphs">,
  workspaceName: string,
  appUrl: string,
): string {
  const link = notice.threadId
    ? `${appUrl}/dashboard/tickets?thread=${encodeURIComponent(notice.threadId)}`
    : `${appUrl}/dashboard`
  const instead = notice.kind === "briefing"
    ? "Link your iPhone to get it as a text instead, or turn the briefing off"
    : "Link your iPhone to get these as texts instead"
  return [
    ...notice.paragraphs,
    `${LINK_LABELS[notice.kind]}: ${link}`,
    `You're getting this by email because no phone is linked to ${workspaceName} in Shopkeeper. ${instead}: ${appUrl}/dashboard/settings/briefing`,
  ].join("\n\n")
}

async function memberEmails(clerkOrgId: string): Promise<{ userId: string; email: string }[]> {
  const client = await clerkClient()
  const { data: memberships } = await client.organizations.getOrganizationMembershipList({
    organizationId: clerkOrgId,
    limit: 100,
  })
  const userIds = memberships.flatMap((membership) => membership.publicUserData?.userId ?? [])
  if (userIds.length === 0) return []
  const { data: users } = await client.users.getUserList({ userId: userIds, limit: 100 })
  return users.flatMap((user) => {
    const email = user.primaryEmailAddress?.emailAddress
    return email ? [{ userId: user.id, email }] : []
  })
}

function dedupeKey(idempotencyKey: string, userId: string): string {
  return `notice-email:${idempotencyKey}:${userId}`
}

async function wasSent(key: string): Promise<boolean> {
  try {
    return (await getRedis().exists(key)) === 1
  } catch (error) {
    logger.warn({ err: (error as Error).message }, "[NoticeEmail] Dedupe check failed; sending anyway")
    return false
  }
}

async function markSent(key: string): Promise<void> {
  try {
    await getRedis().set(key, "1", { ex: DEDUPE_TTL_SECONDS })
  } catch (error) {
    logger.warn({ err: (error as Error).message }, "[NoticeEmail] Dedupe mark failed")
  }
}

export async function sendNoticeEmail(notice: NoticeEmail): Promise<NoticeEmailResult> {
  const org = await db.organization.findUnique({
    where: { id: notice.orgId },
    select: { clerkOrgId: true, name: true, lifecycleStatus: true },
  })
  if (!org) throw new NotFoundError("Workspace not found")
  if (notice.threadId) {
    const thread = await db.thread.findFirst({
      where: { id: notice.threadId, organizationId: notice.orgId },
      select: { id: true },
    })
    if (!thread) throw new NotFoundError("Conversation not found")
  }

  const fromAddress = getNoticeEmailFrom()
  if (!fromAddress) return { sent: 0, failed: 0, skipped: "not_configured" }
  if (org.lifecycleStatus !== "active") return { sent: 0, failed: 0, skipped: "inactive_workspace" }
  const recipients = await memberEmails(org.clerkOrgId)
  if (recipients.length === 0) return { sent: 0, failed: 0, skipped: "no_recipients" }

  const text = noticeEmailText(notice, org.name, getDashboardAppUrl())
  const sender = new PostmarkSender()
  let sent = 0
  let failed = 0
  for (const recipient of recipients) {
    const key = dedupeKey(notice.idempotencyKey, recipient.userId)
    if (await wasSent(key)) {
      sent += 1
      continue
    }
    try {
      await sender.send({
        to: recipient.email,
        fromAddress,
        fromName: AGENT_DISPLAY_NAME,
        subject: notice.subject,
        text,
      })
    } catch (error) {
      if (error instanceof EmailNotConfiguredError) return { sent, failed, skipped: "not_configured" }
      failed += 1
      logger.error(
        { err: (error as Error).message, orgId: notice.orgId, kind: notice.kind },
        "[NoticeEmail] Send failed",
      )
      continue
    }
    await markSent(key)
    sent += 1
  }
  return { sent, failed, skipped: null }
}

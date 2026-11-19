/**
 * Internal notice-email hop: the gateway calls this for a workspace with no
 * linked phone, in place of the text it would have sent (gateway
 * `emailWorkspaceNotice`). Postmark and Clerk keys stay in the dashboard.
 *
 * Auth: x-internal-secret header. No Clerk session.
 *
 * Body: { orgId, kind, threadId, subject, paragraphs, idempotencyKey }
 * Response: { sent, failed, skipped }; 502 when every send failed.
 */
import { NextResponse } from "next/server"
import { readRequiredJsonObject } from "@/lib/api/body"
import { BadRequestError } from "@/lib/api/errors"
import { withInternalRoute } from "@/lib/api/internal-route"
import { NOTICE_EMAIL_KINDS, sendNoticeEmail, type NoticeEmail, type NoticeEmailKind } from "@/lib/server/notice-email"

const MAX_SUBJECT_LENGTH = 200
const MAX_TEXT_LENGTH = 20_000

function isKind(value: unknown): value is NoticeEmailKind {
  return NOTICE_EMAIL_KINDS.includes(value as NoticeEmailKind)
}

function parseBody(value: Record<string, unknown>): NoticeEmail {
  const { orgId, kind, threadId, subject, paragraphs, idempotencyKey } = value
  if (typeof orgId !== "string" || !orgId) throw new BadRequestError("orgId is required")
  if (!isKind(kind)) throw new BadRequestError(`kind must be one of ${NOTICE_EMAIL_KINDS.join(", ")}`)
  if (threadId !== null && (typeof threadId !== "string" || !threadId)) {
    throw new BadRequestError("threadId must be a string or null")
  }
  if (typeof subject !== "string" || !subject.trim() || subject.length > MAX_SUBJECT_LENGTH || /[\r\n]/.test(subject)) {
    throw new BadRequestError(`subject must be one line of at most ${MAX_SUBJECT_LENGTH} characters`)
  }
  if (
    !Array.isArray(paragraphs) || paragraphs.length === 0
    || !paragraphs.every((paragraph) => typeof paragraph === "string" && paragraph.trim())
    || paragraphs.join("").length > MAX_TEXT_LENGTH
  ) {
    throw new BadRequestError(`paragraphs must be non-empty strings totalling at most ${MAX_TEXT_LENGTH} characters`)
  }
  if (typeof idempotencyKey !== "string" || !idempotencyKey || idempotencyKey.length > 128) {
    throw new BadRequestError("idempotencyKey is required")
  }
  return { orgId, kind, threadId, subject, paragraphs, idempotencyKey }
}

export const POST = withInternalRoute(
  {
    context: "Notice email internal POST",
    errorMessage: "Failed to email the notice",
  },
  async ({ request }) => {
    const result = await sendNoticeEmail(parseBody(await readRequiredJsonObject(request)))
    return NextResponse.json(result, { status: result.sent === 0 && result.failed > 0 ? 502 : 200 })
  },
)

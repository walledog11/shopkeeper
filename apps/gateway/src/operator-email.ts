/**
 * Email for a workspace with no linked phone. Plan cards, questions,
 * escalations and the briefing go to bound phones (`listOperatorBindings`);
 * with none bound, which is every merchant without an iPhone, they reached only
 * the dashboard. Each now reaches the workspace's members as an email that says
 * what is waiting and links to it. Approving stays in the app: the email never
 * asks for a reply.
 *
 * The dashboard holds the Postmark and Clerk keys, so it finds the members,
 * adds the link and sends (`/api/agent/notice-email-internal`), deduping per
 * member on `idempotencyKey`. Best-effort: the work is on the dashboard either
 * way, so a failed email is logged and alerted and the job that raised it
 * carries on.
 */
import { postDashboardInternal } from './clients/dashboard-internal.js';
import logger from './logger.js';
import { emitOpsAlert } from './ops-alerts.js';

/** What the email asks of the merchant; the dashboard words the link after it. */
type WorkspaceNoticeKind = 'approval' | 'question' | 'handoff' | 'briefing';

export interface WorkspaceNotice {
  kind: WorkspaceNoticeKind;
  /** The conversation it links to; null links to the dashboard home. */
  threadId: string | null;
  subject: string;
  /** Plain-text paragraphs, composed from the same fields as the phone card. */
  paragraphs: string[];
  idempotencyKey: string;
}

interface NoticeEmailResult {
  sent: number;
  failed: number;
  skipped: string | null;
}

export async function emailWorkspaceNotice(
  organizationId: string,
  notice: WorkspaceNotice,
): Promise<boolean> {
  const context = { organizationId, kind: notice.kind, threadId: notice.threadId };
  let failure: string;
  try {
    const response = await postDashboardInternal<NoticeEmailResult>('/api/agent/notice-email-internal', {
      orgId: organizationId,
      ...notice,
    });
    if (response.ok) {
      logger.info({ ...context, ...response.data }, '[NoticeEmail] Notice emailed');
      return response.data.sent > 0;
    }
    failure = `HTTP ${response.status ?? 'unknown'}: ${response.responseBody.slice(0, 300)}`;
  } catch (error) {
    failure = (error as Error).message;
  }
  logger.warn({ ...context, failure }, '[NoticeEmail] Notice email failed');
  emitOpsAlert({
    category: 'provider_send',
    level: 'error',
    message: '[NoticeEmail] A workspace with no linked phone was not emailed its notice',
    tags: { channel: 'notice_email', kind: notice.kind },
    fingerprint: ['ops-alert', 'provider_send', 'gateway', 'source:notice_email'],
    extra: { ...context, failure },
  }, { pushOncePerSecs: 60 * 60 });
  return false;
}

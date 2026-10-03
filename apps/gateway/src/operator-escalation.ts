import { createInternalNoteOnce, db, type DbChannelType } from '@shopkeeper/db';
import logger from './logger.js';
import { getGatewayDashboardUrl } from './config/env.js';
import { listOperatorBindings, notifyOperator } from './operator-notify.js';
import { escalationNotificationIdempotencyKey } from './operator-notify-idempotency.js';
import type { OrgSettings } from '@shopkeeper/agent/types';
import { composeOperatorHandoff } from './operator-handoff.js';
import { channelNoun } from './message-handlers/support-plan/planning-notifications/headers.js';

export function formatEscalationMessage(
  customerName: string | null,
  channelType: DbChannelType,
  summary: string | null,
  dashboardUrl: string,
  threadId: string,
): string {
  const subject = customerName ? `${customerName}'s ${channelNoun(channelType)}` : `this ${channelNoun(channelType)}`;
  return [
    `Could you take a look at ${subject}?`,
    summary ? `Their request: “${summary}”` : null,
    'I couldn\'t complete this request.',
    '',
    summary ? 'How would you like me to respond?' : 'Please review the original message so I can respond.',
    `${dashboardUrl}/dashboard/tickets?thread=${threadId}`,
  ].filter((line): line is string => line !== null).join('\n');
}

// Resolve the thread + bound operators and push the escalation to each. Shared
// by the internal HTTP route (dashboard sink hops here) and the in-process
// gateway agent sink (auto-execute runs in the worker). Returns the number of
// operators notified, or null when the thread does not exist.
export async function pushOperatorEscalation(
  organizationId: string,
  threadId: string,
  reason: string,
): Promise<number | null> {
  const thread = await db.thread.findFirst({
    where: { id: threadId, organizationId },
    include: { customer: true },
  });
  if (!thread) {
    return null;
  }

  const members = await listOperatorBindings(organizationId);

  if (members.length === 0) {
    logger.info({ organizationId, threadId }, '[OperatorEscalation] No bound members — escalation skipped');
    return 0;
  }

  const dashboardUrl = getGatewayDashboardUrl();
  const idempotencyKey = escalationNotificationIdempotencyKey(organizationId, threadId, reason || 'No reason provided');
  const externalMessageId = `merchant-handoff:${idempotencyKey}`;
  const stored = await db.message.findFirst({
    where: { organizationId, threadId, externalMessageId, senderType: 'note' },
    select: { contentText: true },
  });
  let message = stored?.contentText;
  if (!message) {
    const summary = thread.requestSummary;
    let body = formatEscalationMessage(
      thread.customer?.name ?? null, thread.channelType,
      summary, dashboardUrl, threadId,
    );
    try {
      const organization = await db.organization.findUniqueOrThrow({
        where: { id: organizationId }, select: { settings: true },
      });
      const text = await composeOperatorHandoff({
        organizationId,
        settings: organization.settings as Partial<OrgSettings> | null,
        customerName: thread.customer?.name ?? null,
        request: summary,
        reason,
      });
      if (text) body = `${text}\n\n${dashboardUrl}/dashboard/tickets?thread=${threadId}`;
    } catch {
      logger.warn({ organizationId, threadId },
        '[OperatorEscalation] Handoff composition failed; using the grounded fallback');
    }
    // Store once before fan-out: retries and every operator see the same handoff,
    // not a freshly generated explanation of an already executed escalation.
    const note = await createInternalNoteOnce({
      organizationId, threadId, senderType: 'note', externalMessageId, contentText: body,
    });
    message = note.contentText ?? body;
  }

  let notified = 0;
  for (const member of members) {
    try {
      const result = await notifyOperator(organizationId, member, message, {}, {
        policy: 'critical',
        threadId,
        idempotencyKey,
      });
      if (result) {
        notified += 1;
        logger.info(
          { organizationId, threadId, chatId: result.chatId },
          '[OperatorEscalation] Escalation pushed',
        );
      }
    } catch (error) {
      logger.error(
        {
          err: (error as Error).message,
          organizationId,
          threadId,
          channel: member.channel,
        },
        '[OperatorEscalation] Escalation send failed',
      );
    }
  }

  return notified;
}

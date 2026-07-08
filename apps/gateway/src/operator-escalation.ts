import { db, type DbChannelType } from '@shopkeeper/db';
import logger from './logger.js';
import { getGatewayDashboardUrl } from './config/env.js';
import { listOperatorBindings, notifyOperator } from './operator-notify.js';
import { escalationNotificationIdempotencyKey } from './operator-notify-idempotency.js';
import { formatChannelLabel } from './lib/channel-format.js';

export function formatEscalationMessage(
  customerName: string | null,
  channelType: DbChannelType,
  reason: string,
  summary: string | null,
  dashboardUrl: string,
  threadId: string,
): string {
  const channel = formatChannelLabel(channelType);

  const lines: (string | null)[] = [
    `Escalated — ${channel}`,
    customerName ? `From: ${customerName}` : null,
    `Reason: ${reason}`,
    '',
    summary ? `"${summary}"` : null,
    summary ? '' : null,
    `Open: ${dashboardUrl}/dashboard/tickets/${threadId}`,
  ];

  return lines.filter((l): l is string => l !== null).join('\n');
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
  const message = formatEscalationMessage(
    thread.customer?.name ?? null,
    thread.channelType,
    reason || 'No reason provided',
    thread.aiSummary,
    dashboardUrl,
    threadId,
  );

  const idempotencyKey = escalationNotificationIdempotencyKey(organizationId, threadId, reason || 'No reason provided');

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

import express, { type Request, type Response, type Router } from 'express';
import { db, type DbChannelType } from '@clerk/db';
import logger from '../logger.js';
import { CHANNEL } from '../constants.js';
import { notifyOperator } from '../operator-notify.js';
import { getGatewayDashboardUrl } from '../config/env.js';
import { authorizeInternalRequest } from './internal-auth.js';

function formatEscalationMessage(
  customerName: string | null,
  channelType: DbChannelType,
  reason: string,
  summary: string | null,
  dashboardUrl: string,
  threadId: string,
): string {
  const channel = channelType === CHANNEL.IG_DM
    ? 'Instagram DM'
    : channelType.charAt(0).toUpperCase() + channelType.slice(1);

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

export function registerInternalOperatorRoutes(router: Router): void {
  router.post('/operator/escalate', async (req: Request, res: Response) => {
    if (!authorizeInternalRequest(req, res, 'InternalOperator')) return;

    const body = req.body as { organizationId?: unknown; threadId?: unknown; reason?: unknown };
    const organizationId = typeof body.organizationId === 'string' ? body.organizationId : null;
    const threadId = typeof body.threadId === 'string' ? body.threadId : null;
    const reason = typeof body.reason === 'string' ? body.reason : '';
    if (!organizationId || !threadId) {
      return res.status(400).json({ error: 'organizationId and threadId are required' });
    }

    try {
      const thread = await db.thread.findFirst({
        where: { id: threadId, organizationId },
        include: { customer: true },
      });
      if (!thread) {
        return res.status(404).json({ error: 'Thread not found' });
      }

      const members = await db.orgMemberTelegramChat.findMany({
        where: { orgMember: { organizationId } },
        select: { chatId: true },
      });

      if (members.length === 0) {
        logger.info({ organizationId, threadId }, '[InternalOperator] No bound members — escalation skipped');
        return res.status(200).json({ notified: 0 });
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

      let notified = 0;
      for (const member of members) {
        const result = await notifyOperator(organizationId, member, message, {});
        if (result) {
          notified += 1;
          logger.info(
            { organizationId, threadId, chatId: result.chatId },
            '[InternalOperator] Escalation pushed',
          );
        }
      }

      return res.status(200).json({ notified });
    } catch (err) {
      logger.error(
        { err: (err as Error).message, organizationId, threadId },
        '[InternalOperator] escalation handler error',
      );
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  });
}

const router = express.Router();
registerInternalOperatorRoutes(router);
export default router;

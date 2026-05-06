import type { Request, Response, Router } from 'express';
import { timingSafeEqual } from 'crypto';
import { db } from '@clerk/db';
import twilio from 'twilio';
import { getContext, updateContext, extractOrderNumber, type ToolCall } from '../sms-context.js';
import { getGatewayDashboardUrl } from '../config/env.js';
import logger from '../logger.js';
import { CHANNEL, READ_TOOLS, STATUS } from '../constants.js';
import { getTwilio } from '../clients/twilio-client.js';
import { getRateLimitRedis } from './webhooks-shared.js';
import { recordWebhookSignatureFailure } from './webhooks-signature-alerts.js';

const FILLER_PHRASES = [
  'On it…',
  'Give me a sec…',
  'Making it happen…',
  'Looking into that…',
  'Just a moment…',
];
const filler = () => FILLER_PHRASES[Math.floor(Math.random() * FILLER_PHRASES.length)];

export function registerTwilioWebhookRoutes(router: Router): void {
  router.post('/twilio', async (req: Request, res: Response) => {
    const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;

    const incomingSecret = req.headers['x-internal-secret'] as string | undefined;
    const validInternalSecrets = (
      [process.env.INTERNAL_API_SECRET, process.env.INTERNAL_API_SECRET_PREV] as (string | undefined)[]
    ).filter((s): s is string => typeof s === 'string' && s.length > 0);
    const isInternalProxy = !!incomingSecret && validInternalSecrets.some((candidate) => {
      try { return timingSafeEqual(Buffer.from(candidate, 'utf8'), Buffer.from(incomingSecret, 'utf8')); }
      catch { return false; }
    });

    if (!isInternalProxy) {
      if (!twilioAuthToken) {
        logger.error('[Twilio] TWILIO_AUTH_TOKEN is not configured — rejecting.');
        return res.status(500).send('Internal Server Error');
      }
      const twilioSignature = req.headers['x-twilio-signature'] as string | undefined;
      const webhookUrl = process.env.TWILIO_WEBHOOK_URL;
      if (!twilioSignature) {
        logger.warn('[Twilio] Missing signature — rejecting.');
        recordWebhookSignatureFailure(
          'twilio',
          'missing_signature',
          { counterClient: getRateLimitRedis() },
        ).catch((err) => logger.error({ err }, '[Twilio] Signature alert error'));
        return res.status(403).send('Forbidden');
      }
      if (!webhookUrl) {
        logger.error('[Twilio] TWILIO_WEBHOOK_URL is not configured — rejecting.');
        return res.status(500).send('Internal Server Error');
      }
      const isValid = twilio.validateRequest(twilioAuthToken, twilioSignature, webhookUrl, req.body as Record<string, string>);
      if (!isValid) {
        logger.warn('[Twilio] Signature validation failed — rejecting request.');
        recordWebhookSignatureFailure(
          'twilio',
          'validation_failed',
          { counterClient: getRateLimitRedis() },
        ).catch((err) => logger.error({ err }, '[Twilio] Signature alert error'));
        return res.status(403).send('Forbidden');
      }
    }

    const toRaw: string = req.body.To || '';
    const fromRaw: string = req.body.From || '';
    const body: string = (req.body.Body || '').trim();

    const toNumber = toRaw.replace(/^whatsapp:/, '');
    const fromNumber = fromRaw.replace(/^whatsapp:/, '');

    if (!toNumber || !fromNumber || !body) {
      return res.status(400).send('Bad Request');
    }

    const twimlReply = (text: string) => {
      res.type('text/xml');
      return res.send(`<Response><Message>${text}</Message></Response>`);
    };

    const proactiveSend = async (text: string) => {
      const tw = getTwilio();
      if (!tw) return;
      try {
        await tw.client.messages.create({ from: toRaw, to: fromRaw, body: text });
      } catch (e) {
        logger.warn({ err: (e as Error).message }, '[Twilio] Failed to send proactive message');
      }
    };

    try {
      let organizationId: string;

      const integration = await db.integration.findFirst({
        where: { platform: CHANNEL.SMS, externalAccountId: toNumber },
        select: { organizationId: true },
      });

      if (integration) {
        organizationId = integration.organizationId;
      } else {
        const memberByPhone = await db.orgMember.findFirst({
          where: { phoneNumber: fromNumber, phoneVerified: true },
          select: { organizationId: true },
        });
        if (!memberByPhone) {
          logger.warn({ toNumber, fromNumber }, '[Twilio] No integration found and no verified member — dropping.');
          return res.status(200).send('OK');
        }
        organizationId = memberByPhone.organizationId;
        logger.info({ organizationId, fromNumber }, '[Twilio] Sandbox fallback — resolved org via sender phone');
      }

      const member = await db.orgMember.findFirst({
        where: { organizationId, phoneNumber: fromNumber, phoneVerified: true },
      });

      if (!member) {
        logger.warn({ fromNumber, organizationId }, '[Twilio] Unregistered sender');
        return twimlReply("Your number isn't registered. Add it in your Clerk dashboard under Settings > Phone.");
      }

      const ctx = await getContext(organizationId, fromNumber);

      const dashboardUrl = getGatewayDashboardUrl();
      const internalSecret = process.env.INTERNAL_API_SECRET;

      const normalised = body.toLowerCase().trim();
      const isRun = normalised === 'run' || normalised === 'yes';
      const isDismiss = normalised === 'dismiss' || normalised === 'no';
      const skipMatch = normalised.match(/^skip\s+(\d+)$/);

      const isReview = normalised === 'review';
      const openMatch = normalised.match(/^open\s+(\d+)$/);
      const spamMatch = normalised.match(/^spam\s+(\d+)$/);
      const replyMatch = body.match(/^reply\s+(\d+)\s+([\s\S]+)$/i);

      if ((isReview || openMatch || spamMatch || replyMatch) && ctx.pendingDigest) {
        const { threadIds } = ctx.pendingDigest;

        if (isReview) {
          if (threadIds.length === 0) {
            return twimlReply('No flagged tickets in your last digest.');
          }
          const rows = await db.thread.findMany({
            where: { id: { in: threadIds }, organizationId },
            select: { id: true, aiSummary: true, filterReason: true, customer: { select: { name: true } } },
          });
          const byId = new Map(rows.map(r => [r.id, r]));
          const lines = ['Flagged tickets:'];
          threadIds.forEach((id, i) => {
            const t = byId.get(id);
            if (!t) return;
            const blurb = (t.aiSummary ?? t.filterReason ?? '').trim();
            const truncated = blurb.length > 90 ? `${blurb.slice(0, 90)}…` : blurb;
            lines.push(`${i + 1}. ${t.customer.name ?? 'Unknown'}${truncated ? ` — ${truncated}` : ''}`);
          });
          lines.push('', 'OPEN <n> · SPAM <n> · REPLY <n> <text>');
          return twimlReply(lines.join('\n'));
        }

        const idxMatch = openMatch ?? spamMatch ?? replyMatch;
        const idx = parseInt(idxMatch![1], 10) - 1;
        if (idx < 0 || idx >= threadIds.length) {
          return twimlReply(`No flagged ticket ${idx + 1}. Reply REVIEW to see the list.`);
        }
        const targetId = threadIds[idx];

        if (openMatch) {
          const t = await db.thread.findFirst({
            where: { id: targetId, organizationId },
            select: {
              aiSummary: true,
              tag: true,
              filterReason: true,
              customer: { select: { name: true } },
              messages: {
                where: { senderType: { not: 'note' }, deletedAt: null },
                orderBy: { sentAt: 'desc' },
                take: 1,
                select: { sentAt: true, contentText: true },
              },
            },
          });
          if (!t) return twimlReply('Ticket not found.');
          const last = t.messages[0];
          const ageMs = last ? Date.now() - new Date(last.sentAt).getTime() : null;
          const ageStr = ageMs == null ? ''
            : ageMs < 3_600_000 ? `${Math.round(ageMs / 60_000)}m ago`
            : ageMs < 86_400_000 ? `${Math.round(ageMs / 3_600_000)}h ago`
            : `${Math.round(ageMs / 86_400_000)}d ago`;
          const lines = [
            `${idx + 1}. ${t.customer.name ?? 'Unknown'}`,
            t.aiSummary ? `"${t.aiSummary}"` : null,
            `Tag: ${t.tag ?? 'Untagged'}${t.filterReason ? ` · Flagged: ${t.filterReason}` : ''}`,
            last ? `Last${ageStr ? ` (${ageStr})` : ''}: "${(last.contentText ?? '').slice(0, 120)}"` : null,
            '',
            `Reply SPAM ${idx + 1} or REPLY ${idx + 1} <text>.`,
          ].filter((l): l is string => l !== null);
          return twimlReply(lines.join('\n'));
        }

        if (spamMatch) {
          await db.thread.update({
            where: { id: targetId },
            data: {
              filterStatus: 'filtered',
              filterFeedback: 'confirmed_spam',
              filterDecidedAt: new Date(),
            },
          });
          return twimlReply(`Marked ${idx + 1} as spam.`);
        }

        if (replyMatch) {
          const text = replyMatch[2].trim();
          await proactiveSend(filler());
          res.type('text/xml').send('<Response/>');

          const apiRes = await fetch(`${dashboardUrl}/api/messages/internal`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-internal-secret': internalSecret || '' },
            body: JSON.stringify({ threadId: targetId, text }),
          });
          if (!apiRes.ok) {
            const err = await apiRes.text();
            logger.error({ status: apiRes.status, err, threadId: targetId }, '[Twilio] Digest REPLY failed');
            await proactiveSend('Reply failed to send. Please try again from the dashboard.');
            return;
          }
          await proactiveSend(`Reply sent on ticket ${idx + 1}.`);
          return;
        }
      }

      if ((isRun || isDismiss || skipMatch) && ctx.pendingPlan) {
        const { threadId, instruction, rawToolCalls } = ctx.pendingPlan;

        if (isDismiss) {
          await updateContext(organizationId, fromNumber, { pendingPlan: null });
          return twimlReply('Plan dismissed.');
        }

        let approvedToolCalls: ToolCall[] = rawToolCalls;
        if (skipMatch) {
          const skipIndex = parseInt(skipMatch[1], 10) - 1;
          const actionableCalls = rawToolCalls.filter(tc => !READ_TOOLS.has(tc.name));
          const toSkip = actionableCalls[skipIndex];
          approvedToolCalls = toSkip
            ? rawToolCalls.filter(tc => tc.id !== toSkip.id)
            : rawToolCalls;
        }

        logger.info({ fromNumber, threadId, toolCallCount: approvedToolCalls.length }, '[Twilio] Approving plan');

        await proactiveSend(filler());
        res.type('text/xml').send('<Response/>');

        const agentRes = await fetch(`${dashboardUrl}/api/agent/internal`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-internal-secret': internalSecret || '',
          },
          body: JSON.stringify({
            orgId: organizationId,
            threadId,
            instruction,
            approvedToolCalls,
            senderPhone: fromNumber,
            clerkUserId: member.clerkUserId,
          }),
        });

        if (!agentRes.ok) {
          const err = await agentRes.text();
          logger.error({ status: agentRes.status, err }, '[Twilio] Internal agent API error');
          await proactiveSend('Something went wrong running the plan. Please try again.');
          return;
        }

        const { summary } = await agentRes.json() as { summary: string };

        await updateContext(organizationId, fromNumber, {
          pendingPlan: null,
          lastThreadId: threadId,
          history: [
            ...ctx.history,
            { role: 'user', content: body },
            { role: 'assistant', content: summary },
          ],
        });

        await proactiveSend(summary || 'Done.');
        return;
      }

      const lookupMatch = body.trim().match(/^#(\d+)$|^order[- #]*(\d+)$/i);
      if (lookupMatch) {
        const num = lookupMatch[1] ?? lookupMatch[2];
        const orderRef = `#${num}`;

        const thread = await db.thread.findFirst({
          where: {
            organizationId,
            status: STATUS.OPEN,
            deletedAt: null,
            messages: { some: { contentText: { contains: orderRef }, deletedAt: null } },
          },
          orderBy: { updatedAt: 'desc' },
          select: {
            id: true,
            aiSummary: true,
            tag: true,
            customer: { select: { name: true } },
            messages: {
              where: { senderType: { not: 'note' }, deletedAt: null },
              orderBy: { sentAt: 'desc' },
              take: 1,
              select: { sentAt: true, contentText: true },
            },
          },
        });

        if (thread) {
          const lastMsg = thread.messages[0];
          const ageMs = lastMsg ? Date.now() - new Date(lastMsg.sentAt).getTime() : null;
          const ageStr = ageMs == null ? ''
            : ageMs < 3_600_000 ? `${Math.round(ageMs / 60_000)}m ago`
            : ageMs < 86_400_000 ? `${Math.round(ageMs / 3_600_000)}h ago`
            : `${Math.round(ageMs / 86_400_000)}d ago`;

          const lines = [
            `${orderRef} — ${thread.customer.name ?? 'Unknown customer'}`,
            thread.aiSummary ? `"${thread.aiSummary}"` : null,
            `Tag: ${thread.tag ?? 'Untagged'} · Open`,
            lastMsg
              ? `Last message${ageStr ? ` (${ageStr})` : ''}: "${(lastMsg.contentText ?? '').slice(0, 120)}"`
              : null,
            '',
            'Reply yes to execute the last plan, or type an instruction.',
          ].filter((l): l is string => l !== null);

          await updateContext(organizationId, fromNumber, {
            lastOrderNumber: orderRef,
            lastThreadId: thread.id,
          });

          return twimlReply(lines.join('\n'));
        }
      }

      const mentionedOrder = extractOrderNumber(body);
      const orderNumber = mentionedOrder || ctx.lastOrderNumber;

      logger.info({ fromNumber, organizationId, orderNumber: orderNumber || null }, '[Twilio] Free-form agent instruction');

      await proactiveSend(filler());
      res.type('text/xml').send('<Response/>');

      const agentRes = await fetch(`${dashboardUrl}/api/agent/internal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': internalSecret || '',
        },
        body: JSON.stringify({
          orgId: organizationId,
          instruction: body,
          ...(orderNumber ? { orderNumber } : {}),
          ...(ctx.lastThreadId ? { threadId: ctx.lastThreadId } : {}),
          senderPhone: fromNumber,
          clerkUserId: member.clerkUserId,
        }),
      });

      if (!agentRes.ok) {
        const err = await agentRes.text();
        logger.error({ status: agentRes.status, err }, '[Twilio] Internal agent API error (free-form)');
        await proactiveSend('Something went wrong running the agent. Please try again.');
        return;
      }

      const { summary, threadId } = await agentRes.json() as { summary: string; threadId: string };

      await updateContext(organizationId, fromNumber, {
        ...(orderNumber ? { lastOrderNumber: orderNumber } : {}),
        lastThreadId: threadId,
        history: [
          ...ctx.history,
          { role: 'user', content: body },
          { role: 'assistant', content: summary },
        ],
      });

      await proactiveSend(summary || 'Done.');

    } catch (error) {
      logger.error({ err: error }, '[Twilio] Webhook error');
      if (!res.headersSent) {
        return twimlReply('An unexpected error occurred. Please try again.');
      }
      await proactiveSend('An unexpected error occurred. Please try again.');
    }
  });
}
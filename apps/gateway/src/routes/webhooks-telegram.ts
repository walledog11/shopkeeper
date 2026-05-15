import type { Request, Response, Router } from 'express';
import { timingSafeEqual } from 'crypto';
import { db } from '@clerk/db';
import { getContext, updateContext, extractOrderNumber, type ToolCall } from '../operator-context.js';
import { getGatewayDashboardUrl } from '../config/env.js';
import logger from '../logger.js';
import { READ_TOOLS, STATUS } from '../constants.js';
import { isTelegramConfigured, sendMessage } from '../clients/telegram-client.js';
import { getRateLimitRedis } from './webhooks-shared.js';
import {
  buildWebhookSignatureRequestMetadata,
  recordWebhookSignatureFailure,
} from './webhooks-signature-alerts.js';

const FILLER_PHRASES = [
  'On it…',
  'Give me a sec…',
  'Making it happen…',
  'Looking into that…',
  'Just a moment…',
];
const filler = () => FILLER_PHRASES[Math.floor(Math.random() * FILLER_PHRASES.length)];

interface TelegramUpdate {
  message?: {
    text?: string;
    chat: { id: number; type: 'private' | 'group' | 'supergroup' | 'channel' };
  };
}

function relativeAge(ms: number | null): string {
  if (ms == null) return '';
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
}

export function registerTelegramWebhookRoutes(router: Router): void {
  router.post('/telegram', async (req: Request, res: Response) => {
    if (!isTelegramConfigured()) {
      return res.status(404).send('Not Found');
    }

    const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (!expectedSecret) {
      logger.error('[Telegram] TELEGRAM_WEBHOOK_SECRET is not configured — rejecting.');
      return res.status(500).send('Internal Server Error');
    }

    const incomingSecret = req.headers['x-telegram-bot-api-secret-token'] as string | undefined;
    const alertDeps = () => ({
      counterClient: getRateLimitRedis(),
      route: '/webhooks/telegram',
      request: buildWebhookSignatureRequestMetadata(req),
    });

    if (!incomingSecret) {
      logger.warn('[Telegram] Missing secret token header — rejecting.');
      recordWebhookSignatureFailure('telegram', 'missing_signature', alertDeps())
        .catch((err) => logger.error({ err }, '[Telegram] Signature alert error'));
      return res.status(403).send('Forbidden');
    }

    const expectedBuf = Buffer.from(expectedSecret, 'utf8');
    const incomingBuf = Buffer.from(incomingSecret, 'utf8');
    const matches = expectedBuf.length === incomingBuf.length && timingSafeEqual(expectedBuf, incomingBuf);
    if (!matches) {
      logger.warn('[Telegram] Secret token mismatch — rejecting request.');
      recordWebhookSignatureFailure('telegram', 'signature_mismatch', alertDeps())
        .catch((err) => logger.error({ err }, '[Telegram] Signature alert error'));
      return res.status(403).send('Forbidden');
    }

    const message = (req.body as TelegramUpdate).message;
    if (!message || !message.text || !message.chat) {
      return res.status(200).send('OK');
    }

    const chatId = String(message.chat.id);

    if (message.chat.type !== 'private') {
      logger.info({ chatType: message.chat.type }, '[Telegram] Ignoring non-private chat');
      res.status(200).send('OK');
      await sendMessage(chatId, 'Clerk only works in 1:1 chats. Open a direct message with the bot.');
      return;
    }

    const body = message.text.trim();
    if (!body) return res.status(200).send('OK');

    res.status(200).send('OK');

    const reply = async (text: string) => {
      try {
        await sendMessage(chatId, text);
      } catch (e) {
        logger.warn({ err: (e as Error).message }, '[Telegram] Failed to send message');
      }
    };

    try {
      if (body.toLowerCase().startsWith('/start')) {
        await handleStart(chatId, body, reply);
        return;
      }

      const member = await db.orgMember.findFirst({ where: { telegramChatId: chatId } });
      if (!member) {
        logger.warn({ chatId }, '[Telegram] Unbound sender');
        await reply(
          "This chat isn't connected to a Clerk workspace. Generate a link from your Clerk dashboard under Integrations → Telegram.",
        );
        return;
      }

      await handleMessage(member.organizationId, member.clerkUserId, chatId, body, reply);
    } catch (error) {
      logger.error({ err: error }, '[Telegram] Webhook error');
      await reply('An unexpected error occurred. Please try again.');
    }
  });
}

async function handleStart(chatId: string, body: string, reply: (text: string) => Promise<void>): Promise<void> {
  const startMatch = body.match(/^\/start\s+(\S+)/i);
  if (!startMatch) {
    await reply(
      "This Telegram chat isn't linked to a Clerk workspace. Generate a link from your Clerk dashboard under Integrations → Telegram.",
    );
    return;
  }

  const token = startMatch[1];
  const redis = getRateLimitRedis();
  const key = `telegram:bind:${token}`;
  const raw = await redis.get(key);
  if (!raw) {
    await reply('This link has expired. Generate a new one from your Clerk dashboard under Integrations → Telegram.');
    return;
  }

  let payload: { orgId: string; clerkUserId: string };
  try {
    payload = JSON.parse(raw) as { orgId: string; clerkUserId: string };
  } catch {
    await redis.del(key);
    await reply('This link is invalid. Generate a new one from your Clerk dashboard under Integrations → Telegram.');
    return;
  }

  // Clear the chatId from any other member (re-bind in a new workspace).
  await db.orgMember.updateMany({
    where: {
      telegramChatId: chatId,
      NOT: { organizationId: payload.orgId, clerkUserId: payload.clerkUserId },
    },
    data: { telegramChatId: null },
  });

  const updated = await db.orgMember.updateMany({
    where: { organizationId: payload.orgId, clerkUserId: payload.clerkUserId },
    data: { telegramChatId: chatId },
  });

  if (updated.count === 0) {
    logger.warn({ orgId: payload.orgId, clerkUserId: payload.clerkUserId }, '[Telegram] Bind target OrgMember not found');
    await reply('Could not link this chat — your workspace membership is missing. Open the Clerk dashboard and try again.');
    return;
  }

  await redis.del(key);
  await reply("Connected. Reply to ticket digests here, or send free-form instructions like 'refund #1234'.");
}

async function handleMessage(
  organizationId: string,
  clerkUserId: string,
  chatId: string,
  body: string,
  reply: (text: string) => Promise<void>,
): Promise<void> {
  const ctx = await getContext(organizationId, chatId);
  const dashboardUrl = getGatewayDashboardUrl();
  const internalSecret = process.env.INTERNAL_API_SECRET ?? '';

  const normalised = body.toLowerCase();
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
        await reply('No flagged tickets in your last digest.');
        return;
      }
      const rows = await db.thread.findMany({
        where: { id: { in: threadIds }, organizationId },
        select: { id: true, aiSummary: true, filterReason: true, customer: { select: { name: true } } },
      });
      const byId = new Map(rows.map((r) => [r.id, r]));
      const lines = ['Flagged tickets:'];
      threadIds.forEach((id, i) => {
        const t = byId.get(id);
        if (!t) return;
        const blurb = (t.aiSummary ?? t.filterReason ?? '').trim();
        const truncated = blurb.length > 90 ? `${blurb.slice(0, 90)}…` : blurb;
        lines.push(`${i + 1}. ${t.customer.name ?? 'Unknown'}${truncated ? ` — ${truncated}` : ''}`);
      });
      lines.push('', 'OPEN <n> · SPAM <n> · REPLY <n> <text>');
      await reply(lines.join('\n'));
      return;
    }

    const idxMatch = openMatch ?? spamMatch ?? replyMatch!;
    const idx = parseInt(idxMatch[1], 10) - 1;
    if (idx < 0 || idx >= threadIds.length) {
      await reply(`No flagged ticket ${idx + 1}. Reply REVIEW to see the list.`);
      return;
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
      if (!t) {
        await reply('Ticket not found.');
        return;
      }
      const last = t.messages[0];
      const ageStr = relativeAge(last ? Date.now() - new Date(last.sentAt).getTime() : null);
      const lines = [
        `${idx + 1}. ${t.customer.name ?? 'Unknown'}`,
        t.aiSummary ? `"${t.aiSummary}"` : null,
        `Tag: ${t.tag ?? 'Untagged'}${t.filterReason ? ` · Flagged: ${t.filterReason}` : ''}`,
        last ? `Last${ageStr ? ` (${ageStr})` : ''}: "${(last.contentText ?? '').slice(0, 120)}"` : null,
        '',
        `Reply SPAM ${idx + 1} or REPLY ${idx + 1} <text>.`,
      ].filter((l): l is string => l !== null);
      await reply(lines.join('\n'));
      return;
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
      await reply(`Marked ${idx + 1} as spam.`);
      return;
    }

    if (replyMatch) {
      const text = replyMatch[2].trim();
      await reply(filler());

      const apiRes = await fetch(`${dashboardUrl}/api/messages/internal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-secret': internalSecret },
        body: JSON.stringify({ threadId: targetId, text }),
      });
      if (!apiRes.ok) {
        const err = await apiRes.text();
        logger.error({ status: apiRes.status, err, threadId: targetId }, '[Telegram] Digest REPLY failed');
        await reply('Reply failed to send. Please try again from the dashboard.');
        return;
      }
      await reply(`Reply sent on ticket ${idx + 1}.`);
      return;
    }
  }

  if ((isRun || isDismiss || skipMatch) && ctx.pendingPlan) {
    const { threadId, instruction, rawToolCalls } = ctx.pendingPlan;

    if (isDismiss) {
      await updateContext(organizationId, chatId, { pendingPlan: null });
      await reply('Plan dismissed.');
      return;
    }

    let approvedToolCalls: ToolCall[] = rawToolCalls;
    if (skipMatch) {
      const skipIndex = parseInt(skipMatch[1], 10) - 1;
      const actionable = rawToolCalls.filter((tc) => !READ_TOOLS.has(tc.name));
      const toSkip = actionable[skipIndex];
      approvedToolCalls = toSkip ? rawToolCalls.filter((tc) => tc.id !== toSkip.id) : rawToolCalls;
    }

    logger.info({ chatId, threadId, toolCallCount: approvedToolCalls.length }, '[Telegram] Approving plan');

    await reply(filler());

    const agentRes = await fetch(`${dashboardUrl}/api/agent/internal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': internalSecret },
      body: JSON.stringify({
        orgId: organizationId,
        threadId,
        instruction,
        approvedToolCalls,
        clerkUserId,
      }),
    });

    if (!agentRes.ok) {
      const err = await agentRes.text();
      logger.error({ status: agentRes.status, err }, '[Telegram] Internal agent API error');
      await reply('Something went wrong running the plan. Please try again.');
      return;
    }

    const { summary } = (await agentRes.json()) as { summary: string };

    await updateContext(organizationId, chatId, {
      pendingPlan: null,
      lastThreadId: threadId,
      history: [
        ...ctx.history,
        { role: 'user', content: body },
        { role: 'assistant', content: summary },
      ],
    });

    await reply(summary || 'Done.');
    return;
  }

  const lookupMatch = body.match(/^#(\d+)$|^order[- #]*(\d+)$/i);
  if (lookupMatch) {
    const orderRef = `#${lookupMatch[1] ?? lookupMatch[2]}`;

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
      const ageStr = relativeAge(lastMsg ? Date.now() - new Date(lastMsg.sentAt).getTime() : null);
      const lines = [
        `${orderRef} — ${thread.customer.name ?? 'Unknown customer'}`,
        thread.aiSummary ? `"${thread.aiSummary}"` : null,
        `Tag: ${thread.tag ?? 'Untagged'} · Open`,
        lastMsg ? `Last message${ageStr ? ` (${ageStr})` : ''}: "${(lastMsg.contentText ?? '').slice(0, 120)}"` : null,
        '',
        'Reply yes to execute the last plan, or type an instruction.',
      ].filter((l): l is string => l !== null);

      await updateContext(organizationId, chatId, {
        lastOrderNumber: orderRef,
        lastThreadId: thread.id,
      });

      await reply(lines.join('\n'));
      return;
    }
  }

  const orderNumber = extractOrderNumber(body) || ctx.lastOrderNumber;

  logger.info({ chatId, organizationId, orderNumber: orderNumber || null }, '[Telegram] Free-form agent instruction');

  await reply(filler());

  const agentRes = await fetch(`${dashboardUrl}/api/agent/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-internal-secret': internalSecret },
    body: JSON.stringify({
      orgId: organizationId,
      instruction: body,
      ...(orderNumber ? { orderNumber } : {}),
      ...(ctx.lastThreadId ? { threadId: ctx.lastThreadId } : {}),
      senderPhone: `telegram:${chatId}`,
      clerkUserId,
    }),
  });

  if (!agentRes.ok) {
    const err = await agentRes.text();
    logger.error({ status: agentRes.status, err }, '[Telegram] Internal agent API error (free-form)');
    await reply('Something went wrong running the agent. Please try again.');
    return;
  }

  const { summary, threadId } = (await agentRes.json()) as { summary: string; threadId: string };

  await updateContext(organizationId, chatId, {
    ...(orderNumber ? { lastOrderNumber: orderNumber } : {}),
    lastThreadId: threadId,
    history: [
      ...ctx.history,
      { role: 'user', content: body },
      { role: 'assistant', content: summary },
    ],
  });

  await reply(summary || 'Done.');
}

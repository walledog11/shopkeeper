import { db } from '@clerk/db';
import logger from '../../logger.js';
import { getRateLimitRedis } from '../webhooks-shared.js';
import type { TelegramReply } from './types.js';

export async function handleStartBinding(
  chatId: string,
  token: string | null,
  reply: TelegramReply,
): Promise<void> {
  if (!token) {
    await reply(
      "This Telegram chat isn't linked to a Clerk workspace. Generate a link from your Clerk dashboard under Integrations → Telegram.",
    );
    return;
  }

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
  await reply("Connected. Text SUMMARY for your inbox or HELP for commands. You can also reply to digests or send instructions like 'refund #1234'.");
}

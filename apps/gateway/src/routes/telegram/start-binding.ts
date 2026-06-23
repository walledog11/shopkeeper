import { deleteOrgMemberBindToken, findOrgMemberBindToken, db } from '@shopkeeper/db';
import logger from '../../logger.js';
import { sendMessage } from '../../clients/telegram-client.js';
import type { TelegramChatMetadata, TelegramReply } from './types.js';

const MAX_TELEGRAM_DEVICES = 3;

export async function handleStartBinding(
  chatId: string,
  token: string | null,
  metadata: TelegramChatMetadata,
  reply: TelegramReply,
): Promise<void> {
  if (!token) {
    await reply(
      "This Telegram chat isn't linked to a Shopkeeper workspace. Generate a link from your Shopkeeper dashboard under Integrations → Telegram.",
    );
    return;
  }

  const payload = await findOrgMemberBindToken(token);
  if (!payload) {
    await reply('This link has expired. Generate a new one from your Shopkeeper dashboard under Integrations → Telegram.');
    return;
  }

  // Resolve the target OrgMember
  const member = await db.orgMember.findUnique({
    where: {
      organizationId_clerkUserId: {
        organizationId: payload.organizationId,
        clerkUserId: payload.clerkUserId,
      },
    },
    include: { telegramChats: { select: { chatId: true } } },
  });

  if (!member) {
    logger.warn(
      { orgId: payload.organizationId, clerkUserId: payload.clerkUserId },
      '[Telegram] Bind target OrgMember not found',
    );
    await reply('Could not link this chat — your workspace membership is missing. Open the Shopkeeper dashboard and try again.');
    return;
  }

  // Device cap: refuse if the member already has MAX_TELEGRAM_DEVICES bound
  const existingChatIds = member.telegramChats.map((c) => c.chatId);
  const alreadyBound = existingChatIds.includes(chatId);
  if (!alreadyBound && existingChatIds.length >= MAX_TELEGRAM_DEVICES) {
    await reply(
      `You already have ${MAX_TELEGRAM_DEVICES} devices connected. Disconnect one from your Shopkeeper dashboard under Integrations → Telegram before adding another.`,
    );
    return;
  }

  // If this chatId was previously bound to a different member, remove that binding
  await db.orgMemberTelegramChat.deleteMany({
    where: { chatId, NOT: { orgMemberId: member.id } },
  });

  // Upsert the binding for this member
  await db.orgMemberTelegramChat.upsert({
    where: { chatId },
    create: {
      orgMemberId: member.id,
      chatId,
      telegramUserId: metadata.telegramUserId,
      displayName: metadata.displayName,
      username: metadata.username,
    },
    update: {
      telegramUserId: metadata.telegramUserId,
      displayName: metadata.displayName,
      username: metadata.username,
    },
  });

  await deleteOrgMemberBindToken(token);

  // Security alert: notify all other already-bound devices
  const otherChatIds = existingChatIds.filter((id) => id !== chatId);
  for (const otherChatId of otherChatIds) {
    sendMessage(
      otherChatId,
      'A new device was linked to your Shopkeeper account. If this wasn\'t you, disconnect it from your dashboard under Integrations → Telegram.',
    ).catch((err: unknown) =>
      logger.warn({ err, chatId: otherChatId }, '[Telegram] Failed to send new-device alert'),
    );
  }

  await reply("Connected. Text SUMMARY for your inbox or HELP for commands. You can also reply to digests or send instructions like 'refund #1234'.");
}

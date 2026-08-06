import { db } from "@shopkeeper/db"
import type { TelegramMemberStatus } from "@/lib/integrations/telegram-status"
import { normalizeTelegramBotUsername } from "@/lib/integrations/telegram-visibility"

function getConfiguredBotUsername(): string | null {
  return normalizeTelegramBotUsername(process.env.TELEGRAM_BOT_USERNAME)
}

function formatChatLabel(chat: { displayName: string | null; username: string | null }): string | null {
  if (chat.displayName) return chat.displayName
  if (chat.username) return `@${chat.username.replace(/^@+/, "")}`
  return null
}

export async function getTelegramMemberStatus(
  organizationId: string,
  clerkUserId: string,
): Promise<TelegramMemberStatus> {
  const member = await db.orgMember.findUnique({
    where: { organizationId_clerkUserId: { organizationId, clerkUserId } },
    select: {
      telegramChats: {
        select: {
          chatId: true,
          createdAt: true,
          displayName: true,
          username: true,
        },
        orderBy: { createdAt: "asc" },
      },
    },
  })

  const chats = member?.telegramChats ?? []
  return {
    connected: chats.length > 0,
    chats: chats.map(chat => ({
      chatId: chat.chatId,
      connectedAt: chat.createdAt.toISOString(),
      displayLabel: formatChatLabel(chat),
    })),
    botUsername: getConfiguredBotUsername(),
  }
}

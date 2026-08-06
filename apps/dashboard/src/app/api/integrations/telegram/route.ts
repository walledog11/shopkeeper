/**
 * GET    /api/integrations/telegram       — list Telegram chats bound to this user
 * POST   /api/integrations/telegram       — issue a single-use bind token + deep-link URL
 * DELETE /api/integrations/telegram       — disconnect all of this user's Telegram chats
 * DELETE /api/integrations/telegram?chatId=xxx — disconnect a single chat
 */
import { NextResponse } from "next/server";
import { createOrgMemberBindToken, db } from "@shopkeeper/db";
import { auth } from "@clerk/nextjs/server";
import { ApiError, UnauthorizedError } from "@/lib/api/errors";
import { withOrgRoute } from "@/lib/api/route";
import { normalizeTelegramBotUsername } from "@/lib/integrations/telegram-visibility";
import { getTelegramMemberStatus } from "@/lib/server/telegram-integration";

const MAX_TELEGRAM_DEVICES = 3;

function getBotUsername(): string | null {
  return normalizeTelegramBotUsername(process.env.TELEGRAM_BOT_USERNAME);
}

export const GET = withOrgRoute(
  { context: "Telegram GET", errorMessage: "Failed to fetch Telegram integration" },
  async ({ org }) => {
    const { userId } = await auth();
    if (!userId) throw new UnauthorizedError();

    const status = await getTelegramMemberStatus(org.id, userId);
    return NextResponse.json(status);
  },
);

export const POST = withOrgRoute(
  { context: "Telegram POST", errorMessage: "Failed to start Telegram connect", requireBillingWriteAllowed: true },
  async ({ org }) => {
    const { userId } = await auth();
    if (!userId) throw new UnauthorizedError();

    const botUsername = getBotUsername();
    if (!botUsername) {
      throw new ApiError("Telegram is not configured on this platform.", 503);
    }

    const member = await db.orgMember.upsert({
      where: { organizationId_clerkUserId: { organizationId: org.id, clerkUserId: userId } },
      create: { organizationId: org.id, clerkUserId: userId },
      update: {},
      select: { _count: { select: { telegramChats: true } } },
    });

    if (member._count.telegramChats >= MAX_TELEGRAM_DEVICES) {
      throw new ApiError(
        `Device limit reached. Disconnect one of your ${MAX_TELEGRAM_DEVICES} connected devices before adding another.`,
        409,
      );
    }

    const { token, expiresInSeconds } = await createOrgMemberBindToken({
      organizationId: org.id,
      clerkUserId: userId,
    });

    return NextResponse.json({
      url: `https://t.me/${botUsername}?start=${token}`,
      expiresInSeconds,
    });
  },
);

export const DELETE = withOrgRoute(
  { context: "Telegram DELETE", errorMessage: "Failed to disconnect Telegram" },
  async ({ org, request }) => {
    const { userId } = await auth();
    if (!userId) throw new UnauthorizedError();

    const { searchParams } = new URL(request.url);
    const targetChatId = searchParams.get("chatId");

    const member = await db.orgMember.findUnique({
      where: { organizationId_clerkUserId: { organizationId: org.id, clerkUserId: userId } },
      select: { id: true },
    });

    if (!member) {
      return NextResponse.json({ disconnected: true });
    }

    if (targetChatId) {
      // Disconnect a single device — scoped to this member only
      await db.orgMemberTelegramChat.deleteMany({
        where: { chatId: targetChatId, orgMemberId: member.id },
      });
    } else {
      // Disconnect all devices for this member
      await db.orgMemberTelegramChat.deleteMany({
        where: { orgMemberId: member.id },
      });
    }

    return NextResponse.json({ disconnected: true });
  },
);

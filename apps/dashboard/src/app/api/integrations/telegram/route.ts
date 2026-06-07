/**
 * GET    /api/integrations/telegram       — list Telegram chats bound to this user
 * POST   /api/integrations/telegram       — issue a single-use bind token + deep-link URL
 * DELETE /api/integrations/telegram       — disconnect all of this user's Telegram chats
 * DELETE /api/integrations/telegram?chatId=xxx — disconnect a single chat
 */
import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { db } from "@shopkeeper/db";
import { auth } from "@clerk/nextjs/server";
import { getRedis } from "@/lib/redis";
import { ApiError, UnauthorizedError } from "@/lib/api/errors";
import { withOrgRoute } from "@/lib/api/route";

const BIND_TOKEN_TTL_SECONDS = 24 * 60 * 60;
const MAX_TELEGRAM_DEVICES = 3;

function getBotUsername(): string | null {
  const v = process.env.TELEGRAM_BOT_USERNAME?.trim();
  return v && v.length > 0 ? v : null;
}

export const GET = withOrgRoute(
  { context: "Telegram GET", errorMessage: "Failed to fetch Telegram integration" },
  async ({ org }) => {
    const { userId } = await auth();
    if (!userId) throw new UnauthorizedError();

    const member = await db.orgMember.findUnique({
      where: { organizationId_clerkUserId: { organizationId: org.id, clerkUserId: userId } },
      select: { telegramChats: { select: { chatId: true, createdAt: true }, orderBy: { createdAt: "asc" } } },
    });

    const chats = member?.telegramChats ?? [];
    return NextResponse.json({
      connected: chats.length > 0,
      chats: chats.map((c) => ({ chatId: c.chatId, connectedAt: c.createdAt.toISOString() })),
      botUsername: getBotUsername(),
    });
  },
);

export const POST = withOrgRoute(
  { context: "Telegram POST", errorMessage: "Failed to start Telegram connect" },
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

    const token = randomBytes(24).toString("base64url");
    await getRedis().set(
      `telegram:bind:${token}`,
      JSON.stringify({ orgId: org.id, clerkUserId: userId }),
      { ex: BIND_TOKEN_TTL_SECONDS },
    );

    return NextResponse.json({
      url: `https://t.me/${botUsername}?start=${token}`,
      expiresInSeconds: BIND_TOKEN_TTL_SECONDS,
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

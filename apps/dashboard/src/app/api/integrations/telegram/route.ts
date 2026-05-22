/**
 * GET    /api/integrations/telegram — fetch current Telegram binding for this user
 * POST   /api/integrations/telegram — issue a single-use bind token + deep-link URL
 * DELETE /api/integrations/telegram — clear this user's Telegram binding
 */
import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { db } from "@clerk/db";
import { auth } from "@clerk/nextjs/server";
import { getRedis } from "@/lib/redis";
import { ApiError, UnauthorizedError } from "@/lib/api/errors";
import { withOrgRoute } from "@/lib/api/route";

const BIND_TOKEN_TTL_SECONDS = 24 * 60 * 60;

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
      select: { telegramChatId: true },
    });

    return NextResponse.json({
      connected: !!member?.telegramChatId,
      chatId: member?.telegramChatId ?? null,
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

    await db.orgMember.upsert({
      where: { organizationId_clerkUserId: { organizationId: org.id, clerkUserId: userId } },
      create: { organizationId: org.id, clerkUserId: userId },
      update: {},
    });

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
  async ({ org }) => {
    const { userId } = await auth();
    if (!userId) throw new UnauthorizedError();

    await db.orgMember.updateMany({
      where: { organizationId: org.id, clerkUserId: userId },
      data: { telegramChatId: null },
    });

    return NextResponse.json({ disconnected: true });
  },
);

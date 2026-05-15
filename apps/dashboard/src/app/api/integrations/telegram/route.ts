/**
 * GET    /api/integrations/telegram — fetch current Telegram binding for this user
 * POST   /api/integrations/telegram — issue a single-use bind token + deep-link URL
 * DELETE /api/integrations/telegram — clear this user's Telegram binding
 */
import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { db } from "@clerk/db";
import { auth } from "@clerk/nextjs/server";
import { getOrCreateOrg } from "@/lib/server/org";
import { getRedis } from "@/lib/redis";
import { handleApiError } from "@/lib/api/errors";

const BIND_TOKEN_TTL_SECONDS = 24 * 60 * 60;

function getBotUsername(): string | null {
  const v = process.env.TELEGRAM_BOT_USERNAME?.trim();
  return v && v.length > 0 ? v : null;
}

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const org = await getOrCreateOrg();
    const member = await db.orgMember.findUnique({
      where: { organizationId_clerkUserId: { organizationId: org.id, clerkUserId: userId } },
      select: { telegramChatId: true },
    });

    return NextResponse.json({
      connected: !!member?.telegramChatId,
      chatId: member?.telegramChatId ?? null,
      botUsername: getBotUsername(),
    });
  } catch (error) {
    return handleApiError(error, "Telegram GET", "Failed to fetch Telegram integration");
  }
}

export async function POST() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const botUsername = getBotUsername();
    if (!botUsername) {
      return NextResponse.json(
        { error: "Telegram is not configured on this platform." },
        { status: 503 },
      );
    }

    const org = await getOrCreateOrg();

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
  } catch (error) {
    return handleApiError(error, "Telegram POST", "Failed to start Telegram connect");
  }
}

export async function DELETE() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const org = await getOrCreateOrg();
    await db.orgMember.updateMany({
      where: { organizationId: org.id, clerkUserId: userId },
      data: { telegramChatId: null },
    });

    return NextResponse.json({ disconnected: true });
  } catch (error) {
    return handleApiError(error, "Telegram DELETE", "Failed to disconnect Telegram");
  }
}

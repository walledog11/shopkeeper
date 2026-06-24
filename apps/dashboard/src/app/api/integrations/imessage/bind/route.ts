/**
 * GET    /api/integrations/imessage/bind            — list iMessage handles this user has bound
 * POST   /api/integrations/imessage/bind            — issue a single-use bind token to text to the line
 * DELETE /api/integrations/imessage/bind            — unbind all of this user's iMessage handles
 * DELETE /api/integrations/imessage/bind?senderId=x — unbind a single handle
 *
 * iMessage has no Telegram-style `/start` deep link, so binding works by the merchant
 * texting the minted token to their line; the gateway consumes it (routes/imessage/binding.ts).
 */
import { NextResponse } from "next/server";
import { ChannelType, createOrgMemberBindToken, db } from "@shopkeeper/db";
import { auth } from "@clerk/nextjs/server";
import { ApiError, UnauthorizedError } from "@/lib/api/errors";
import { withOrgRoute } from "@/lib/api/route";

export const dynamic = "force-dynamic";

export const GET = withOrgRoute(
  { context: "iMessage bind GET", errorMessage: "Failed to fetch iMessage bindings" },
  async ({ org }) => {
    const { userId } = await auth();
    if (!userId) throw new UnauthorizedError();

    const [lineCount, bindings] = await Promise.all([
      db.integration.count({
        where: { organizationId: org.id, platform: ChannelType.imessage },
      }),
      db.orgMemberImessageBinding.findMany({
        where: { orgMember: { organizationId: org.id, clerkUserId: userId } },
        select: { senderId: true, displayName: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    return NextResponse.json({
      lineConnected: lineCount > 0,
      connected: bindings.length > 0,
      handles: bindings.map((b) => ({
        senderId: b.senderId,
        displayLabel: b.displayName ?? b.senderId,
        connectedAt: b.createdAt.toISOString(),
      })),
    });
  },
);

export const POST = withOrgRoute(
  { context: "iMessage bind POST", errorMessage: "Failed to start iMessage connect", requireBillingWriteAllowed: true },
  async ({ org }) => {
    const { userId } = await auth();
    if (!userId) throw new UnauthorizedError();

    const lineCount = await db.integration.count({
      where: { organizationId: org.id, platform: ChannelType.imessage },
    });
    if (lineCount === 0) {
      throw new ApiError("Connect your iMessage line before linking a handle.", 409);
    }

    await db.orgMember.upsert({
      where: { organizationId_clerkUserId: { organizationId: org.id, clerkUserId: userId } },
      create: { organizationId: org.id, clerkUserId: userId },
      update: {},
      select: { id: true },
    });

    const { token, expiresInSeconds } = await createOrgMemberBindToken({
      organizationId: org.id,
      clerkUserId: userId,
    });

    return NextResponse.json({ token, expiresInSeconds });
  },
);

export const DELETE = withOrgRoute(
  { context: "iMessage bind DELETE", errorMessage: "Failed to disconnect iMessage" },
  async ({ org, request }) => {
    const { userId } = await auth();
    if (!userId) throw new UnauthorizedError();

    const { searchParams } = new URL(request.url);
    const targetSenderId = searchParams.get("senderId");

    await db.orgMemberImessageBinding.deleteMany({
      where: {
        orgMember: { organizationId: org.id, clerkUserId: userId },
        ...(targetSenderId ? { senderId: targetSenderId } : {}),
      },
    });

    return NextResponse.json({ disconnected: true });
  },
);

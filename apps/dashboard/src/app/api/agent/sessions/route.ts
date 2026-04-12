/**
 * GET  /api/agent/sessions — list past dashboard_agent sessions for this user
 * DELETE /api/agent/sessions — delete all sessions for this user
 */
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@clerk/db";
import { getOrCreateOrg } from "@/lib/org";
import { handleApiError } from "@/lib/api-errors";

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const org = await getOrCreateOrg();
    const platformId = `dashboard:${userId}`;

    const customer = await db.customer.findUnique({
      where: { organizationId_platformId: { organizationId: org.id, platformId } },
    });

    if (!customer) return NextResponse.json([]);

    const threads = await db.thread.findMany({
      where: { organizationId: org.id, customerId: customer.id, channelType: "dashboard_agent", archivedAt: null },
      orderBy: { createdAt: "desc" },
      include: {
        messages: {
          orderBy: { sentAt: "asc" },
          select: { senderType: true, contentText: true },
        },
      },
    });

    return NextResponse.json(
      threads.map((t) => ({
        id: t.id,
        createdAt: t.createdAt,
        preview:
          t.messages.find((m) => m.senderType === "customer")?.contentText ?? "Empty session",
        messages: t.messages
          .filter((m) => m.senderType === "customer" || m.senderType === "agent")
          .map((m) => ({
            role: m.senderType === "customer" ? "user" : "agent",
            text: m.contentText ?? "",
          })),
      }))
    );
  } catch (error) {
    return handleApiError(error, "GET /api/agent/sessions", "Failed to fetch sessions");
  }
}

export async function DELETE() {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const org = await getOrCreateOrg();
    const platformId = `dashboard:${userId}`;

    const customer = await db.customer.findUnique({
      where: { organizationId_platformId: { organizationId: org.id, platformId } },
    });

    if (!customer) return NextResponse.json({ ok: true });

    await db.thread.updateMany({
      where: {
        organizationId: org.id,
        customerId: customer.id,
        channelType: "dashboard_agent",
      },
      data: { archivedAt: new Date() },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error, "DELETE /api/agent/sessions", "Failed to clear sessions");
  }
}

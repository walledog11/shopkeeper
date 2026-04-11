/**
 * GET /api/agent/actions
 *
 * Returns a paginated action log of all agent turns across all threads for this org.
 * Reads __clerk_agent__ note messages and filters to entries with at least one action.
 *
 * Query params:
 *   cursor — ISO timestamp (sentAt) for cursor-based pagination
 *
 * Response: { entries: ActionLogEntry[], nextCursor: string | null }
 */
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@clerk/db";
import { getOrCreateOrg } from "@/lib/org";
import { handleApiError } from "@/lib/api-errors";
import { AGENT_TURN_PREFIX } from "@/lib/agent/tools";
import type { ActionLogEntry } from "@/types";

const PAGE_SIZE = 50;

export async function GET(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const org = await getOrCreateOrg();
    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get("cursor");

    if (cursor && isNaN(new Date(cursor).getTime())) {
      return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
    }

    const messages = await db.message.findMany({
      where: {
        senderType: "note",
        contentText: { startsWith: AGENT_TURN_PREFIX },
        thread: { organizationId: org.id },
        ...(cursor ? { sentAt: { lt: new Date(cursor) } } : {}),
      },
      orderBy: { sentAt: "desc" },
      take: PAGE_SIZE + 1,
      select: {
        id: true,
        sentAt: true,
        contentText: true,
        thread: {
          select: {
            id: true,
            channelType: true,
            tag: true,
            customer: {
              select: {
                name: true,
                platformId: true,
              },
            },
          },
        },
      },
    });

    const hasMore = messages.length > PAGE_SIZE;
    const page = hasMore ? messages.slice(0, PAGE_SIZE) : messages;

    const entries: ActionLogEntry[] = [];

    for (const msg of page) {
      const raw = msg.contentText?.slice(AGENT_TURN_PREFIX.length);
      if (!raw) continue;

      let parsed: { instruction?: string; summary?: string; actions?: Array<{ tool: string; result: string }> };
      try {
        parsed = JSON.parse(raw);
      } catch {
        continue;
      }

      const actions = parsed.actions ?? [];
      if (actions.length === 0) continue;

      const { customer } = msg.thread;
      const handle =
        customer.name ??
        (customer.platformId.startsWith("dashboard:")
          ? "Dashboard session"
          : customer.platformId);

      entries.push({
        id: msg.id,
        sentAt: msg.sentAt.toISOString(),
        threadId: msg.thread.id,
        channelType: msg.thread.channelType,
        threadTag: msg.thread.tag,
        customerHandle: handle,
        instruction: parsed.instruction ?? null,
        summary: parsed.summary ?? "",
        actions,
      });
    }

    const nextCursor = hasMore ? page[page.length - 1].sentAt.toISOString() : null;

    return NextResponse.json({ entries, nextCursor });
  } catch (error) {
    return handleApiError(error, "GET /api/agent/actions", "Failed to fetch action log");
  }
}

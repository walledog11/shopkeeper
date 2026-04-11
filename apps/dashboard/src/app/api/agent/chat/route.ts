/**
 * Dashboard Agent Chat API
 *
 * Clerk-auth'd endpoint for the standalone /dashboard/agent page.
 * Bootstraps a dashboard_agent session on first message, then reuses it.
 *
 * Body:    { instruction: string, sessionId?: string }
 * Response: { sessionId: string, summary: string, actionsPerformed: ActionEntry[] }
 */
import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@clerk/db";
import { getOrCreateOrg } from "@/lib/org";
import { buildContext, runAgent } from "@/lib/agent/runner";
import { resolveAgentSettings } from "@/lib/agent/settings";
import { handleApiError } from "@/lib/api-errors";
import { AGENT_TURN_PREFIX } from "@/lib/agent/tools";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import logger from "@/lib/logger";
import type { OrgSettings } from "@/types";

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const org = await getOrCreateOrg();

    const rl = await rateLimit(`agent:chat:${org.id}`, 10, 60);
    if (!rl.success) return tooManyRequests(rl.reset);

    const { instruction, sessionId } = await request.json();

    if (!instruction?.trim()) {
      return NextResponse.json({ error: "Missing instruction" }, { status: 400 });
    }

    if (instruction.length > 2000) {
      return NextResponse.json({ error: "Instruction too long" }, { status: 400 });
    }

    let resolvedSessionId: string;

    if (sessionId) {
      // Validate the session belongs to this org and is a dashboard_agent thread
      const existing = await db.thread.findUnique({
        where: { id: sessionId },
        select: { id: true, organizationId: true, channelType: true },
      });
      if (!existing || existing.organizationId !== org.id || existing.channelType !== "dashboard_agent") {
        return NextResponse.json({ error: "Session not found" }, { status: 404 });
      }
      resolvedSessionId = existing.id;
    } else {
      // Bootstrap a new session: upsert a synthetic customer scoped to this user,
      // then create a dashboard_agent thread.
      const platformId = `dashboard:${userId}`;
      const customerKey = { organizationId: org.id, platformId };
      let customer = await db.customer.findUnique({ where: { organizationId_platformId: customerKey } });
      if (!customer) {
        try {
          customer = await db.customer.create({ data: { organizationId: org.id, platformId } });
        } catch (err) {
          if ((err as { code?: string }).code !== 'P2002') throw err;
          customer = (await db.customer.findUnique({ where: { organizationId_platformId: customerKey } }))!;
        }
      }

      const thread = await db.thread.create({
        data: {
          organizationId: org.id,
          customerId: customer.id,
          channelType: "dashboard_agent",
          status: "open",
          tag: "Dashboard Session",
        },
      });
      resolvedSessionId = thread.id;
    }

    const settings = resolveAgentSettings(org.settings as Partial<OrgSettings> | null);

    // Save the user instruction before building context so it's included in history
    await db.message.create({
      data: {
        threadId: resolvedSessionId,
        senderType: "customer",
        contentText: instruction.trim(),
      },
    });

    const ctx = await buildContext(resolvedSessionId, org.id);
    const result = await runAgent(ctx, instruction.trim(), undefined, settings);

    // Save the agent response as an agent message so subsequent turns have clean history
    await db.message.create({
      data: {
        threadId: resolvedSessionId,
        senderType: "agent",
        contentText: result.summary,
      },
    });

    // Save an audit note so this action appears in the action log (same format as ticket agent)
    if (result.actionsPerformed.length > 0) {
      await db.message.create({
        data: {
          threadId: resolvedSessionId,
          senderType: "note",
          contentText: `${AGENT_TURN_PREFIX}${JSON.stringify({
            instruction: instruction.trim(),
            actions: result.actionsPerformed,
            summary: result.summary,
            error: null,
          })}`,
        },
      });
    }

    return NextResponse.json({
      sessionId: resolvedSessionId,
      summary: result.summary,
      actionsPerformed: result.actionsPerformed,
    });
  } catch (error) {
    logger.error({ err: error }, "[agent/chat] error");
    return handleApiError(error, "Agent chat POST", "Failed to run agent");
  }
}

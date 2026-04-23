import { NextResponse } from "next/server";
import { getOrCreateOrg } from "@/lib/server/org";
import { handleApiError } from "@/lib/api/errors";
import { requireOrgThread } from "@/lib/agent/api/auth";
import { executeAgentTurn } from "@/lib/agent/api/execution";
import { parseAgentRouteBody } from "@/lib/agent/api/validation";
import { rateLimit, tooManyRequests } from "@/lib/server/rate-limit";
import type { OrgSettings } from "@/types";
import logger from "@/lib/server/logger";

export async function POST(request: Request) {
  try {
    const org = await getOrCreateOrg();

    const rl = await rateLimit(`agent:${org.id}`, 10, 60);
    if (!rl.success) return tooManyRequests(rl.reset);
    const { threadId, instruction, approvedToolCalls } = parseAgentRouteBody(await request.json());
    await requireOrgThread(threadId, org.id);
    logger.info({ orgId: org.id, threadId, approvedToolCalls: approvedToolCalls?.length ?? 0 }, "[agent] POST");

    const result = await executeAgentTurn({
      orgId: org.id,
      threadId,
      instruction,
      orgSettings: org.settings as Partial<OrgSettings> | null,
      approvedToolCalls: approvedToolCalls ?? undefined,
      persistAuditNote: true,
    });
    logger.info({ orgId: org.id, threadId, actionCount: result.actionsPerformed.length }, "[agent] result");

    return NextResponse.json(result);
  } catch (error) {
    logger.error({ err: error }, '[agent] error');
    return handleApiError(error, "Agent POST", "Failed to run agent");
  }
}

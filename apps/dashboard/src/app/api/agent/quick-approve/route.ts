import { NextResponse } from "next/server";
import { Prisma, db } from "@clerk/db";
import { getOrCreateOrg } from "@/lib/server/org";
import { BadRequestError, handleApiError } from "@/lib/api/errors";
import { requireOrgThread } from "@/lib/agent/api/auth";
import { executeAgentTurn } from "@/lib/agent/api/execution";
import { isAgentPlanCacheHit, readAgentPlanCache } from "@/lib/agent/api/plan-cache";
import { parseAgentQuickApproveBody } from "@/lib/agent/api/validation";
import { hashInstructionForLog } from "@/lib/agent/runner";
import { resolveAgentSettings } from "@/lib/agent/settings";
import { classifyHomePlan } from "@/lib/agent/plan-preview";
import { rateLimit, tooManyRequests } from "@/lib/server/rate-limit";
import type { OrgSettings } from "@/types";
import logger from "@/lib/server/logger";

export async function POST(request: Request) {
  const startedAt = Date.now();

  try {
    const org = await getOrCreateOrg();

    const rl = await rateLimit(`agent:quick-approve:${org.id}`, 20, 60);
    if (!rl.success) return tooManyRequests(rl.reset);

    const { threadId } = parseAgentQuickApproveBody(await request.json());
    const thread = await requireOrgThread(threadId, org.id);
    const settings = resolveAgentSettings(org.settings as Partial<OrgSettings> | null);
    const cachedPlan = readAgentPlanCache(thread.cachedPlan);
    const lastCustomerMessage = thread.messages[0] ?? null;
    const instruction = cachedPlan?.instruction ?? "";
    const instructionHash = instruction ? hashInstructionForLog(instruction) : null;

    const currentPlan = cachedPlan && thread.cachedPlanMessageId === lastCustomerMessage?.id && isAgentPlanCacheHit({
      cache: cachedPlan,
      instruction,
      lastCustomerMessageId: lastCustomerMessage?.id ?? null,
      settings,
    }) ? cachedPlan.plan : null;
    const classification = classifyHomePlan(currentPlan);

    if (!currentPlan || classification.kind !== "quick_reply" || !classification.sendReplyToolCall) {
      throw new BadRequestError("Only current quick-reply plans can be approved from the dashboard");
    }

    logger.info({
      orgId: org.id,
      threadId,
      instructionLength: instruction.length,
      instructionHash,
    }, "[agent:quick-approve] POST");

    const result = await executeAgentTurn({
      orgId: org.id,
      threadId,
      instruction,
      orgSettings: settings,
      approvedToolCalls: [classification.sendReplyToolCall],
      persistAuditNote: true,
    });

    const sendReplyResult = result.actionsPerformed.find(action => action.tool === "send_reply")?.result ?? "";
    if (!sendReplyResult || sendReplyResult.toLowerCase().startsWith("error:")) {
      logger.warn({
        orgId: org.id,
        threadId,
        durationMs: Date.now() - startedAt,
        instructionHash,
      }, "[agent:quick-approve] send failed");
      return NextResponse.json({ ...result, error: sendReplyResult || "Reply was not sent." }, { status: 502 });
    }

    await db.thread.update({
      where: { id: threadId },
      data: {
        cachedPlan: Prisma.DbNull,
        cachedPlanMessageId: null,
      },
    });

    logger.info({
      orgId: org.id,
      threadId,
      durationMs: Date.now() - startedAt,
      instructionHash,
    }, "[agent:quick-approve] result");

    return NextResponse.json(result);
  } catch (error) {
    logger.error({ err: error }, "[agent:quick-approve] error");
    return handleApiError(error, "Agent quick approve POST", "Failed to approve reply");
  }
}

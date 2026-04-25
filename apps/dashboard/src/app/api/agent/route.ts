import { NextResponse } from "next/server";
import { getOrCreateOrg } from "@/lib/server/org";
import { BadRequestError, handleApiError } from "@/lib/api/errors";
import { requireOrgThread } from "@/lib/agent/api/auth";
import { executeAgentTurn } from "@/lib/agent/api/execution";
import { isAgentPlanCacheHit, readAgentPlanCache } from "@/lib/agent/api/plan-cache";
import { parseAgentRouteBody } from "@/lib/agent/api/validation";
import { hashInstructionForLog } from "@/lib/agent/runner";
import { resolveAgentSettings } from "@/lib/agent/settings";
import { rateLimit, tooManyRequests } from "@/lib/server/rate-limit";
import type { OrgSettings } from "@/types";
import logger from "@/lib/server/logger";

function serializeToolInput(input: unknown): string {
  return JSON.stringify(input ?? null);
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    const org = await getOrCreateOrg();

    const rl = await rateLimit(`agent:${org.id}`, 10, 60);
    if (!rl.success) return tooManyRequests(rl.reset);
    const { threadId, instruction, approvedToolCalls } = parseAgentRouteBody(await request.json());
    const instructionHash = hashInstructionForLog(instruction);
    const thread = await requireOrgThread(threadId, org.id);
    const settings = resolveAgentSettings(org.settings as Partial<OrgSettings> | null);

    if (!approvedToolCalls?.length) {
      throw new BadRequestError("Agent execution requires an approved plan");
    }

    const cachedPlan = readAgentPlanCache(thread.cachedPlan);
    const lastCustomerMessage = thread.messages[0] ?? null;
    const currentPlan = isAgentPlanCacheHit({
      cache: cachedPlan,
      instruction,
      lastCustomerMessageId: lastCustomerMessage?.id ?? null,
      settings,
    }) ? cachedPlan?.plan : null;
    const plannedToolCallsById = new Map(
      currentPlan?.rawToolCalls.map((toolCall) => [toolCall.id, toolCall]) ?? []
    );
    const approvedCallsMatchPlan = approvedToolCalls.every((approved) => {
      const planned = plannedToolCallsById.get(approved.id);
      return Boolean(
        planned &&
        planned.name === approved.name &&
        serializeToolInput(planned.input) === serializeToolInput(approved.input)
      );
    });

    if (!currentPlan || !approvedCallsMatchPlan) {
      throw new BadRequestError("Approved tool calls must come from the current reviewed plan");
    }

    logger.info({
      orgId: org.id,
      threadId,
      approvedToolCalls: approvedToolCalls.length,
      instructionLength: instruction.length,
      instructionHash,
    }, "[agent] POST");

    const result = await executeAgentTurn({
      orgId: org.id,
      threadId,
      instruction,
      orgSettings: settings,
      approvedToolCalls,
      persistAuditNote: true,
    });
    logger.info({
      orgId: org.id,
      threadId,
      durationMs: Date.now() - startedAt,
      actionCount: result.actionsPerformed.length,
      approvedToolCalls: approvedToolCalls.length,
      instructionHash,
    }, "[agent] result");

    return NextResponse.json(result);
  } catch (error) {
    logger.error({ err: error }, '[agent] error');
    return handleApiError(error, "Agent POST", "Failed to run agent");
  }
}

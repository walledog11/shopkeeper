import { NextResponse } from "next/server";
import { BadRequestError } from "@/lib/api/errors";
import { readRequiredJsonObject } from "@/lib/api/body";
import { withOrgRoute } from "@/lib/api/route";
import { requireOrgThread, getLatestConversationMessage } from "@shopkeeper/agent/thread-auth";
import { executeAgentTurn } from "@/lib/agent/api/execution";
import { isAgentPlanCacheHit, readAgentPlanCache } from "@shopkeeper/agent/plan-cache";
import { getPendingCustomerMessageId } from "@shopkeeper/agent/plan-cache-shape";
import { parseAgentRouteBody } from "@/lib/agent/api/validation";
import { hashInstructionForLog } from "@/lib/agent/runner";
import { resolveAgentSettings } from "@shopkeeper/agent/settings";
import { rateLimit, tooManyRequests } from "@/lib/server/rate-limit";
import { recordAgentRouteFailure } from "@/lib/server/agent-failure-alerts";
import { getRedis } from "@/lib/server/redis";
import { hashInstruction, hashPlan } from "@shopkeeper/agent/agent-actions";
import { resolveShadowDecisionOnApproval } from "@/lib/agent/api/autonomy-shadow";
import { consumeThreadCachedPlan, formatApproverId } from "@/lib/agent/api/plan-execution";
import { resolveSessionApprover } from "@/lib/agent/api/approver";
import type { OrgSettings } from "@/types";
import logger from "@/lib/server/logger";

function serializeToolInput(input: unknown): string {
  return JSON.stringify(input ?? null);
}

export const POST = withOrgRoute(
  {
    context: "Agent POST",
    errorMessage: "Failed to run agent",
    requireBillingWriteAllowed: true,
    onError: async (error, orgId) => {
      logger.error({ err: error }, '[agent] error');
      await recordAgentRouteFailure({
        route: "/api/agent",
        orgId,
        error,
      }, {
        getCounterClient: getRedis,
        onError: (alertError) => {
          logger.error({ err: alertError }, "[agent] failure alert error");
        },
      });
    },
  },
  async ({ org, request }) => {
    const startedAt = Date.now();

    const rl = await rateLimit(`agent:${org.id}`, 10, 60, {
      forceForE2E: request.headers.get("x-e2e-rate-limit") === "enforce",
    });
    if (!rl.success) return tooManyRequests(rl.reset);
    const { threadId, instruction, approvedToolCalls } = parseAgentRouteBody(await readRequiredJsonObject(request));
    const instructionHash = hashInstructionForLog(instruction);
    const thread = await requireOrgThread(threadId, org.id);
    const settings = resolveAgentSettings(org.settings as Partial<OrgSettings> | null);

    if (!approvedToolCalls?.length) {
      throw new BadRequestError("Agent execution requires an approved plan");
    }

    const cachedPlan = readAgentPlanCache(thread.cachedPlan);
    const latestConversation = await getLatestConversationMessage(threadId);
    const pendingCustomerMessageId = latestConversation
      ? getPendingCustomerMessageId([latestConversation])
      : null;
    const currentPlan = pendingCustomerMessageId && isAgentPlanCacheHit({
      cache: cachedPlan,
      instruction,
      lastCustomerMessageId: pendingCustomerMessageId,
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

    const approver = await resolveSessionApprover();
    const result = await executeAgentTurn({
      orgId: org.id,
      threadId,
      instruction,
      failureRoute: "/api/agent",
      orgSettings: settings,
      approvedToolCalls,
      persistAuditNote: true,
      auditMode: "human_approved",
      ...(approver ? {
        approval: {
          approverId: formatApproverId(approver),
          approvedAt: new Date(),
          approvedPlanHash: hashPlan(currentPlan),
          instructionHash: hashInstruction(instruction),
        },
      } : {}),
    }).finally(() => consumeThreadCachedPlan({
      orgId: org.id,
      threadId,
      lastCustomerMessageId: pendingCustomerMessageId,
    }));
    await resolveShadowDecisionOnApproval({
      orgId: org.id,
      threadId,
      approvedToolCalls,
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
  },
);

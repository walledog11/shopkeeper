import { NextResponse } from "next/server";
import { BadRequestError } from "@/lib/api/errors";
import { readRequiredJsonObject } from "@/lib/api/body";
import { withOrgRoute } from "@/lib/api/route";
import { requireOrgThread } from "@shopkeeper/agent/thread-auth";
import { parseAgentRouteBody } from "@/lib/agent/api/validation";
import { hashInstructionForLog } from "@/lib/agent/runner";
import { resolveAgentSettings } from "@shopkeeper/agent/settings";
import { rateLimit, tooManyRequests } from "@/lib/server/rate-limit";
import { recordAgentRouteFailure } from "@/lib/server/agent-failure-alerts";
import { getRedis } from "@/lib/server/redis";
import { hashInstruction } from "@shopkeeper/agent/agent-actions";
import {
  executeCurrentCachedHomePlan,
  getExecutablePlanToolCalls,
} from "@/lib/agent/api/plan-execution";
import { resolveSessionApprover } from "@/lib/agent/api/approver";
import { captureAgentPlanDecided } from "@/lib/server/product-analytics";
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

    logger.info({
      orgId: org.id,
      threadId,
      approvedToolCalls: approvedToolCalls.length,
      instructionLength: instruction.length,
      instructionHash,
    }, "[agent] POST");

    const approver = await resolveSessionApprover();
    const executed = await executeCurrentCachedHomePlan({
      orgId: org.id,
      threadId,
      settings,
      allowedKinds: ["quick_reply", "needs_review", "auto_execute"],
      failureRoute: "/api/agent",
      approvedToolCalls,
      expectedIdentity: { instructionHash: hashInstruction(instruction) },
      ...(approver ? { approver } : {}),
    });
    const result = executed.result;
    if (executed.planId) {
      const executablePlanCalls = getExecutablePlanToolCalls(executed.plan);
      const changed = executablePlanCalls.length !== approvedToolCalls.length
        || executablePlanCalls.some((planned, index) => {
          const approved = approvedToolCalls[index];
          return !approved
            || planned.id !== approved.id
            || planned.name !== approved.name
            || serializeToolInput(planned.input) !== serializeToolInput(approved.input);
        });
      void captureAgentPlanDecided({
        changed,
        channel: thread.channelType,
        decision: 'approved',
        organizationId: org.id,
        planId: executed.planId,
      });
    }

    logger.info({
      orgId: org.id,
      threadId,
      durationMs: Date.now() - startedAt,
      actionCount: result.actionsPerformed.length,
      approvedToolCalls: approvedToolCalls.length,
      instructionHash,
    }, "[agent] result");

    return NextResponse.json({
      ...result,
      execution: executed.execution,
    });
  },
);

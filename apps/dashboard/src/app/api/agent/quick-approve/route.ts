import { NextResponse } from "next/server";
import { readRequiredJsonObject } from "@/lib/api/body";
import { withOrgRoute } from "@/lib/api/route";
import { parseAgentQuickApproveBody } from "@/lib/agent/api/validation";
import { hashInstructionForLog } from "@/lib/agent/runner";
import { resolveAgentSettings } from "@shopkeeper/agent/settings";
import {
  executeCurrentCachedHomePlan,
  findFailedToolResult,
} from "@/lib/agent/api/plan-execution";
import { resolveSessionApprover } from "@/lib/agent/api/approver";
import {
  recordAgentFailure,
  recordAgentRouteFailure,
} from "@/lib/server/agent-failure-alerts";
import { getRedis } from "@/lib/server/redis";
import type { OrgSettings } from "@/types";
import logger from "@/lib/server/logger";
import { captureAgentPlanDecided } from "@/lib/server/product-analytics";

export const POST = withOrgRoute(
  {
    context: "Agent quick approve POST",
    errorMessage: "Failed to approve reply",
    requireBillingWriteAllowed: true,
    rateLimit: { key: "agent:quick-approve", limit: 20, windowSecs: 60 },
    onError: async (error, orgId) => {
      logger.error({ err: error }, "[agent:quick-approve] error");
      await recordAgentRouteFailure({
        route: "/api/agent/quick-approve",
        orgId,
        error,
      }, {
        getCounterClient: getRedis,
        onError: (alertError) => {
          logger.error({ err: alertError }, "[agent:quick-approve] failure alert error");
        },
      });
    },
  },
  async ({ org, request }) => {
    const startedAt = Date.now();
    const { threadId } = parseAgentQuickApproveBody(await readRequiredJsonObject(request));
    const settings = resolveAgentSettings(org.settings as Partial<OrgSettings> | null);
    const approver = await resolveSessionApprover();
    const executed = await executeCurrentCachedHomePlan({
      orgId: org.id,
      threadId,
      settings,
      allowedKinds: ["quick_reply", "needs_review"],
      failureRoute: "/api/agent/quick-approve",
      ...(approver ? { approver } : {}),
    });
    const instructionHash = executed.instruction ? hashInstructionForLog(executed.instruction) : null;

    logger.info({
      orgId: org.id,
      threadId,
      mode: executed.classification.kind,
      instructionLength: executed.instruction.length,
      instructionHash,
    }, "[agent:quick-approve] POST");

    const failed = findFailedToolResult(executed.result);
    if (failed) {
      logger.warn({
        orgId: org.id,
        threadId,
        tool: failed.tool,
        durationMs: Date.now() - startedAt,
        instructionHash,
      }, "[agent:quick-approve] plan execution failed");

      try {
        await recordAgentFailure({
          kind: "route_failure",
          route: "/api/agent/quick-approve",
          orgId: org.id,
          tool: failed.tool,
          statusCode: 502,
          detail: failed.result || "Planned action was not completed.",
        }, {
          counterClient: getRedis(),
        });
      } catch (alertError) {
        logger.error({ err: alertError }, "[agent:quick-approve] failure alert error");
      }

      return NextResponse.json({ ...executed.result, error: failed.result || "Planned action was not completed." }, { status: 502 });
    }

    logger.info({
      orgId: org.id,
      threadId,
      durationMs: Date.now() - startedAt,
      actionCount: executed.result.actionsPerformed.length,
      instructionHash,
    }, "[agent:quick-approve] result");

    if (executed.planId) {
      void captureAgentPlanDecided({
        changed: false,
        channel: executed.channel,
        decision: 'approved',
        organizationId: org.id,
        planId: executed.planId,
      });
    }

    return NextResponse.json(executed.result);
  },
);

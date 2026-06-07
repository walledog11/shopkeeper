/**
 * Internal Plan Generation API , called by the gateway worker when a new
 * thread event occurs and a WhatsApp notification needs to be sent.
 *
 * Auth: x-internal-secret header (shared secret between gateway and dashboard).
 * No Clerk session required.
 *
 * Body: { orgId, threadId }
 * Response: { plan, instruction }
 */
import { NextResponse } from "next/server";

export const maxDuration = 60;
import { db } from "@shopkeeper/db";
import { requireOrgThread } from "@/lib/agent/api/auth";
import { buildAgentPlanCacheRecord, isAgentPlanCacheHit, readAgentPlanCache } from "@/lib/agent/api/plan-cache";
import { parseAgentPlanInternalBody } from "@/lib/agent/api/validation";
import { buildContext, planAgent } from "@/lib/agent/runner";
import { resolveAgentSettings } from "@shopkeeper/agent/settings";
import {
  findFailedToolResult,
  maybeAutoExecuteCurrentCachedHomePlan,
} from "@/lib/agent/api/plan-execution";
import { readRequiredJsonObject } from "@/lib/api/body";
import { rateLimit, tooManyRequests } from "@/lib/server/rate-limit";
import { withInternalRoute } from "@/lib/api/internal-route";
import type { OrgSettings } from "@/types";

export const POST = withInternalRoute(
  {
    context: "Agent plan-internal POST",
    errorMessage: "Failed to generate plan",
  },
  async ({ request }) => {
    const { orgId, threadId, allowAutoExecute } = parseAgentPlanInternalBody(await readRequiredJsonObject(request, {
      malformed: {
        message: "Validation failed",
        details: [{ code: "invalid_body", message: "Request body must be a JSON object" }],
      },
      empty: {
        message: "Validation failed",
        details: [{ code: "invalid_body", message: "Request body must be a JSON object" }],
      },
      object: {
        message: "Validation failed",
        details: [{ code: "invalid_body", message: "Request body must be a JSON object" }],
      },
    }));

    const rl = await rateLimit(`plan-internal:${orgId}`, 30, 60);
    if (!rl.success) {
      return tooManyRequests(rl.reset);
    }

    const thread = await requireOrgThread(threadId, orgId);

    const instruction =
      thread.aiSummary || "Handle this customer's latest request";

    const lastCustomerMessage = thread.messages[0] ?? null;
    const org = await db.organization.findUnique({
      where: { id: orgId },
      select: { settings: true },
    });
    const settings = resolveAgentSettings(
      org?.settings as Partial<OrgSettings> | null
    );

    const cached = readAgentPlanCache(thread.cachedPlan);
    if (lastCustomerMessage && isAgentPlanCacheHit({
      cache: cached,
      instruction,
      lastCustomerMessageId: lastCustomerMessage.id,
      settings,
    })) {
      const autoExecution = allowAutoExecute
        ? await buildAutoExecutionResponse(orgId, threadId, settings)
        : {};
      return NextResponse.json({ plan: cached?.plan, instruction, ...autoExecution });
    }
    const ctx = await buildContext(threadId, orgId);
    const plan = await planAgent(ctx, instruction, settings);

    if (lastCustomerMessage) {
      await db.thread.update({
        where: { id: threadId },
        data: {
          cachedPlanMessageId: lastCustomerMessage.id,
          cachedPlan: buildAgentPlanCacheRecord({
            instruction,
            lastCustomerMessageId: lastCustomerMessage.id,
            settings,
            plan,
          }) as object,
        },
      });
    }

    const autoExecution = allowAutoExecute
      ? await buildAutoExecutionResponse(orgId, threadId, settings)
      : {};

    return NextResponse.json({ plan, instruction, ...autoExecution });
  },
);

async function buildAutoExecutionResponse(
  orgId: string,
  threadId: string,
  settings: OrgSettings,
) {
  const executed = await maybeAutoExecuteCurrentCachedHomePlan({
    orgId,
    threadId,
    settings,
    failureRoute: "/api/agent/plan-internal",
  });

  if (!executed) {
    return {};
  }

  const failed = findFailedToolResult(executed.result);
  return {
    autoExecuted: true,
    autoExecutionStatus: failed ? "error" : "success",
    autoExecutionSummary: executed.result.summary,
    autoExecutionActions: executed.result.actionsPerformed,
    ...(failed ? { autoExecutionError: failed.result, autoExecutionFailedTool: failed.tool } : {}),
  };
}

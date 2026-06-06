import { db } from '@clerk/db';
import { requireOrgThread } from '@clerk/agent/thread-auth';
import { buildContext } from '@clerk/agent/build-context';
import { planAgent } from '@clerk/agent/planner';
import { resolveAgentSettings } from '@clerk/agent/settings';
import {
  buildAgentPlanCacheRecord,
  isAgentPlanCacheHit,
  readAgentPlanCache,
} from '@clerk/agent/plan-cache';
import {
  findFailedToolResult,
  maybeAutoExecuteCurrentCachedHomePlan,
} from '@clerk/agent/plan-execution';
import type { AgentPlan as PackageAgentPlan, OrgSettings } from '@clerk/agent/types';
import type { AgentPlan } from '../types.js';
import { gatewayThreadSink } from './agent-thread-sink.js';
import { buildGatewayPlanExecutionDeps } from './agent-turn-deps.js';
import type { AgentActionResult } from './planning-types.js';

const FAILURE_ROUTE = 'gateway:auto-plan';

// The core returns @clerk/agent's AgentPlan; the gateway's local AgentPlan is the
// looser JSON-shaped view its operator-notification path consumes (index-signature
// rawToolCalls). The data is identical — this is the same widening the old
// plan-internal HTTP boundary did implicitly via JSON.parse.
function toGatewayPlan(plan: PackageAgentPlan | null): AgentPlan | null {
  return plan as unknown as AgentPlan | null;
}

export interface GeneratedThreadPlan {
  plan: AgentPlan | null;
  instruction: string;
  autoExecuted?: boolean;
  autoExecutionStatus?: 'success' | 'error';
  autoExecutionSummary?: string;
  autoExecutionActions?: AgentActionResult[];
  autoExecutionError?: string;
}

// In-process replacement for the plan-internal HTTP hop (Track 4.2). Mirrors
// apps/dashboard/src/app/api/agent/plan-internal/route.ts: resolve the thread +
// settings, serve the plan cache when warm, otherwise plan and cache it, then
// (when within business hours) auto-execute via the moved orchestration with the
// gateway's ioredis lock + no-op shadow.
export async function generateThreadPlan(
  organizationId: string,
  threadId: string,
  allowAutoExecute: boolean,
): Promise<GeneratedThreadPlan> {
  const thread = await requireOrgThread(threadId, organizationId);
  const instruction = thread.aiSummary || "Handle this customer's latest request";
  const lastCustomerMessage = thread.messages[0] ?? null;

  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { settings: true },
  });
  const settings = resolveAgentSettings(org?.settings as Partial<OrgSettings> | null);

  const cached = readAgentPlanCache(thread.cachedPlan);
  if (lastCustomerMessage && isAgentPlanCacheHit({
    cache: cached,
    instruction,
    lastCustomerMessageId: lastCustomerMessage.id,
    settings,
  })) {
    const autoExecution = allowAutoExecute
      ? await buildAutoExecutionResult(organizationId, threadId, settings)
      : {};
    return { plan: toGatewayPlan(cached?.plan ?? null), instruction, ...autoExecution };
  }

  const ctx = await buildContext(threadId, organizationId, gatewayThreadSink);
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
    ? await buildAutoExecutionResult(organizationId, threadId, settings)
    : {};

  return { plan: toGatewayPlan(plan), instruction, ...autoExecution };
}

async function buildAutoExecutionResult(
  organizationId: string,
  threadId: string,
  settings: OrgSettings,
): Promise<Partial<GeneratedThreadPlan>> {
  const executed = await maybeAutoExecuteCurrentCachedHomePlan(
    { orgId: organizationId, threadId, settings, failureRoute: FAILURE_ROUTE },
    buildGatewayPlanExecutionDeps(),
  );
  if (!executed) {
    return {};
  }

  const failed = findFailedToolResult(executed.result);
  return {
    autoExecuted: true,
    autoExecutionStatus: failed ? 'error' : 'success',
    autoExecutionSummary: executed.result.summary,
    autoExecutionActions: executed.result.actionsPerformed,
    ...(failed ? { autoExecutionError: failed.result } : {}),
  };
}

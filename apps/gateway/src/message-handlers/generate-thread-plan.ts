import { db } from '@shopkeeper/db';
import { requireOrgThread, getLatestConversationMessage } from '@shopkeeper/agent/thread-auth';
import { buildContext } from '@shopkeeper/agent/build-context';
import { planAgent } from '@shopkeeper/agent/planner';
import { resolveAgentSettings } from '@shopkeeper/agent/settings';
import {
  buildAgentPlanCacheRecord,
  isAgentPlanCacheHit,
  readAgentPlanCache,
} from '@shopkeeper/agent/plan-cache';
import {
  clearThreadPlanCache,
  findFailedToolResult,
  maybeAutoExecuteCurrentCachedHomePlan,
} from '@shopkeeper/agent/plan-execution';
import { getPendingCustomerMessageId } from '@shopkeeper/agent/plan-cache-shape';
import { shouldSkipAutoPlan } from '@shopkeeper/agent/sender-trust';
import type { AgentPlan as PackageAgentPlan, OrgSettings } from '@shopkeeper/agent/types';
import type { AgentPlan } from '../types.js';
import { gatewayThreadSink } from './agent-thread-sink.js';
import { buildGatewayPlanExecutionDeps } from './agent-turn-deps.js';
import type { AgentActionResult } from './planning-types.js';
import logger from '../logger.js';

const FAILURE_ROUTE = 'gateway:auto-plan';

// The core returns @shopkeeper/agent's AgentPlan; the gateway's local AgentPlan is the
// looser JSON-shaped view its operator-notification path consumes (index-signature
// rawToolCalls). The data is identical at runtime — only the TypeScript view differs.
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

// In-process auto-plan: resolve thread + settings, serve a warm plan cache or
// plan and cache a fresh one, then auto-execute within business hours using the
// gateway lock provider and no-op shadow recorder.
export async function generateThreadPlan(
  organizationId: string,
  threadId: string,
  allowAutoExecute: boolean,
  options: { instruction?: string } = {},
): Promise<GeneratedThreadPlan> {
  const thread = await requireOrgThread(threadId, organizationId);
  const instruction = options.instruction?.trim()
    || thread.aiSummary
    || "Handle this customer's latest request";

  if (shouldSkipAutoPlan(thread.filterStatus)) {
    if (thread.cachedPlan || thread.cachedPlanMessageId) {
      await clearThreadPlanCache({ orgId: organizationId, threadId });
    }
    logger.info(
      { threadId, organizationId, filterStatus: thread.filterStatus },
      '[gateway:auto-plan] Skipping plan generation for non-genuine sender',
    );
    return { plan: null, instruction };
  }

  const latestConversation = await getLatestConversationMessage(threadId);
  const pendingCustomerMessageId = latestConversation
    ? getPendingCustomerMessageId([latestConversation])
    : null;

  if (!pendingCustomerMessageId) {
    if (thread.cachedPlan || thread.cachedPlanMessageId) {
      await clearThreadPlanCache({ orgId: organizationId, threadId });
    }
    return { plan: null, instruction };
  }

  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { settings: true },
  });
  const settings = resolveAgentSettings(org?.settings as Partial<OrgSettings> | null);

  const cached = readAgentPlanCache(thread.cachedPlan);
  if (isAgentPlanCacheHit({
    cache: cached,
    instruction,
    lastCustomerMessageId: pendingCustomerMessageId,
    settings,
  })) {
    const autoExecution = allowAutoExecute
      ? await buildAutoExecutionResult(organizationId, threadId, settings)
      : {};
    return { plan: toGatewayPlan(cached?.plan ?? null), instruction, ...autoExecution };
  }

  const ctx = await buildContext(threadId, organizationId, gatewayThreadSink);
  const plan = await planAgent(ctx, instruction, settings);

  await db.thread.update({
    where: { id: threadId },
    data: {
      cachedPlanMessageId: pendingCustomerMessageId,
      cachedPlan: buildAgentPlanCacheRecord({
        instruction,
        lastCustomerMessageId: pendingCustomerMessageId,
        settings,
        plan,
      }) as object,
    },
  });

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

import { db } from '@shopkeeper/db';
import { requireOrgThread, getLatestConversationMessage } from '@shopkeeper/agent/thread-auth';
import { buildContext } from '@shopkeeper/agent/build-context';
import { planAgent } from '@shopkeeper/agent/planner';
import { classifyHomePlan } from '@shopkeeper/agent/plan-preview';
import { resolveAgentSettings } from '@shopkeeper/agent/settings';
import {
  buildAgentPlanCacheRecord,
  commitThreadPlanCacheIfCurrent,
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
import { hashInstruction, hashPlan } from '@shopkeeper/agent/agent-actions';
import type { AgentPlan as PackageAgentPlan, OrgSettings } from '@shopkeeper/agent/types';
import type { AgentPlan } from '../types.js';
import { toGatewayAgentPlan } from './agent-plan-adapter.js';
import { gatewayThreadSink } from './agent-thread-sink.js';
import { buildGatewayPlanExecutionDeps } from './agent-turn-deps.js';
import type { AgentActionResult, PlanIdentity } from './planning-types.js';
import { publishThreadEvent } from '../realtime/publish.js';
import { captureAgentPlanGenerated } from '../product-analytics.js';
import logger from '../logger.js';

const FAILURE_ROUTE = 'gateway:auto-plan';

// A plan whose terminal tool is `ask_operator` classifies as needs_merchant_input;
// surface its question so the operator-notification path can push it instead of a
// plan-approval prompt. Null for every other plan shape.
function merchantQuestionFor(plan: PackageAgentPlan | null, settings: OrgSettings): string | null {
  if (!plan) return null;
  const classification = classifyHomePlan(plan, settings);
  return classification.kind === 'needs_merchant_input' ? classification.question : null;
}

export interface GeneratedThreadPlan {
  plan: AgentPlan | null;
  instruction: string;
  identity?: PlanIdentity;
  merchantQuestion?: string | null;
  autoExecuted?: boolean;
  autoExecutionStatus?: 'success' | 'error';
  autoExecutionSummary?: string;
  autoExecutionActions?: AgentActionResult[];
  autoExecutionError?: string;
}

function planIdentity(params: {
  planId: string | null;
  sourceMessageId: string | null;
  instruction: string;
  plan: PackageAgentPlan;
}): PlanIdentity | undefined {
  if (!params.planId || !params.sourceMessageId) return undefined;
  return {
    planId: params.planId,
    sourceMessageId: params.sourceMessageId,
    planHash: hashPlan(params.plan),
    instructionHash: hashInstruction(params.instruction),
  };
}

// In-process auto-plan: resolve thread + settings, serve a warm plan cache or
// plan and cache a fresh one, then auto-execute within business hours using the
// gateway lock provider and no-op shadow recorder.
export async function generateThreadPlan(
  organizationId: string,
  threadId: string,
  allowAutoExecute: boolean,
  options: { instruction?: string; sourceMessageId?: string } = {},
): Promise<GeneratedThreadPlan> {
  const generationStartedAt = Date.now();
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

  if (options.sourceMessageId && options.sourceMessageId !== pendingCustomerMessageId) {
    logger.info({
      organizationId,
      threadId,
      expectedSourceMessageId: options.sourceMessageId,
      pendingCustomerMessageId,
    }, '[gateway:auto-plan] Skipping superseded planning job');
    return { plan: null, instruction };
  }

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

  // P5-04: an escalated ticket is flagged for a human. Keep planning and
  // notifying the merchant, but never autonomously execute on it until the
  // escalation flag is cleared — bias to escalation over confident wrong action.
  const autoExecuteAllowed = allowAutoExecute && !thread.escalatedAt;

  const cached = readAgentPlanCache(thread.cachedPlan);
  if (isAgentPlanCacheHit({
    cache: cached,
    instruction,
    lastCustomerMessageId: pendingCustomerMessageId,
    settings,
  })) {
    if (cached?.planId && cached.plan.steps.length > 0) {
      void captureAgentPlanGenerated({
        cacheHit: true,
        channel: thread.channelType,
        generationMs: Date.now() - generationStartedAt,
        organizationId,
        planId: cached.planId,
        stepCount: cached.plan.steps.length,
      });
    }
    const autoExecution = autoExecuteAllowed
      ? await buildAutoExecutionResult(organizationId, threadId, settings)
      : {};
    return {
      plan: toGatewayAgentPlan(cached?.plan ?? null),
      instruction,
      ...(cached?.plan ? { identity: planIdentity({
        planId: cached.planId,
        sourceMessageId: cached.lastCustomerMessageId,
        instruction: cached.instruction,
        plan: cached.plan,
      }) } : {}),
      merchantQuestion: merchantQuestionFor(cached?.plan ?? null, settings),
      ...autoExecution,
    };
  }

  const ctx = await buildContext(threadId, organizationId, gatewayThreadSink);
  const plan = await planAgent(ctx, instruction, settings);
  const cacheRecord = buildAgentPlanCacheRecord({
    instruction,
    lastCustomerMessageId: pendingCustomerMessageId,
    settings,
    plan,
  });

  const committed = await commitThreadPlanCacheIfCurrent({
    orgId: organizationId,
    threadId,
    sourceMessageId: pendingCustomerMessageId,
    cache: cacheRecord,
  });
  if (!committed) {
    logger.info(
      { organizationId, threadId, pendingCustomerMessageId },
      '[gateway:auto-plan] Discarded stale generated plan',
    );
    return { plan: null, instruction };
  }

  // Live inbox: a fresh plan is cached — push so the "Needs you" card appears.
  await publishThreadEvent(organizationId, threadId);

  if (cacheRecord.planId && plan.steps.length > 0) {
    void captureAgentPlanGenerated({
      cacheHit: false,
      channel: thread.channelType,
      generationMs: Date.now() - generationStartedAt,
      organizationId,
      planId: cacheRecord.planId,
      stepCount: plan.steps.length,
    });
  }

  const autoExecution = allowAutoExecute
    ? await buildAutoExecutionResult(organizationId, threadId, settings)
    : {};

  return {
    plan: toGatewayAgentPlan(plan),
    instruction,
    identity: planIdentity({
      planId: cacheRecord.planId,
      sourceMessageId: cacheRecord.lastCustomerMessageId,
      instruction: cacheRecord.instruction,
      plan,
    }),
    merchantQuestion: merchantQuestionFor(plan, settings),
    ...autoExecution,
  };
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

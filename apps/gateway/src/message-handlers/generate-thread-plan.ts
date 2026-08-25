import { db } from '@shopkeeper/db';
import { requireOrgThread, getLatestConversationMessage } from '@shopkeeper/agent/thread-auth';
import { buildContext } from '@shopkeeper/agent/build-context';
import { planAgent } from '@shopkeeper/agent/planner';
import { decideAutonomy } from '@shopkeeper/agent/autonomy';
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
import { CHANNEL_TYPE } from '@shopkeeper/agent/thread-constants';
import type { AgentPlan as PackageAgentPlan, OrgSettings } from '@shopkeeper/agent/types';
import { getEmailProvider } from '@shopkeeper/email/providers';
import type { AgentPlan } from '../types.js';
import { toGatewayAgentPlan } from './agent-plan-adapter.js';
import { gatewayThreadSink } from './agent-thread-sink.js';
import { buildGatewayPlanExecutionDeps } from './agent-turn-deps.js';
import type { AgentActionResult, PlanIdentity } from './planning-types.js';
import { publishThreadEvent } from '../realtime/publish.js';
import { captureAgentPlanGenerated } from '../product-analytics.js';
import logger from '../logger.js';
import { removePendingPlanForThread } from '../operator-context.js';
import { captureCommittedPlanOutcome } from '@shopkeeper/agent/request-outcome';

const FAILURE_ROUTE = 'gateway:auto-plan';
const EMAIL_REPLY_ROUTE_MISSING = 'email_reply_route_missing';
const EMAIL_REPLY_INTEGRATION_INACTIVE = 'email_reply_integration_inactive';
const EMAIL_REPLY_PROVIDER_INCOMPLETE = 'email_reply_provider_incomplete';

type EmailReplyBlock = {
  code:
    | typeof EMAIL_REPLY_ROUTE_MISSING
    | typeof EMAIL_REPLY_INTEGRATION_INACTIVE
    | typeof EMAIL_REPLY_PROVIDER_INCOMPLETE;
  reason: string;
};

function emailReplyBlock(thread: Awaited<ReturnType<typeof requireOrgThread>>): EmailReplyBlock | null {
  if (thread.channelType !== CHANNEL_TYPE.EMAIL) return null;

  const integration = thread.replyIntegration;
  if (!thread.replyIntegrationId || !integration || integration.id !== thread.replyIntegrationId) {
    return {
      code: EMAIL_REPLY_ROUTE_MISSING,
      reason: 'This email conversation has no connected reply integration. Reconnect email before replying.',
    };
  }
  if (integration.platform !== CHANNEL_TYPE.EMAIL || integration.lifecycleStatus !== 'active') {
    return {
      code: EMAIL_REPLY_INTEGRATION_INACTIVE,
      reason: 'This email conversation\'s reply integration is disconnected. Reconnect email before replying.',
    };
  }

  if (getEmailProvider(integration) === 'gmail') {
    const expiresAtMs = integration.tokenExpiresAt?.getTime() ?? null;
    const explicitlyInvalid = expiresAtMs !== null && expiresAtMs <= 0;
    const accessTokenNeedsRefresh = expiresAtMs !== null && expiresAtMs <= Date.now();
    const canRefreshOrSend = Boolean(
      integration.refreshToken
      && (integration.accessToken || accessTokenNeedsRefresh),
    );
    if (explicitlyInvalid || !canRefreshOrSend) {
      return {
        code: EMAIL_REPLY_PROVIDER_INCOMPLETE,
        reason: 'This email conversation\'s Gmail connection needs reauthorization before a reply can be sent.',
      };
    }
  }

  return null;
}

// A plan whose terminal tool is `ask_operator` resolves to needs_merchant_input;
// surface its question so the operator-notification path can push it instead of a
// plan-approval prompt. Null for every other plan shape.
function merchantQuestionFor(plan: PackageAgentPlan | null, settings: OrgSettings): string | null {
  if (!plan) return null;
  const verdict = decideAutonomy(plan, settings);
  return verdict.kind === 'needs_merchant_input' ? verdict.question : null;
}

export interface GeneratedThreadPlan {
  plan: AgentPlan | null;
  instruction: string;
  identity?: PlanIdentity;
  merchantQuestion?: string | null;
  autoExecuted?: boolean;
  autoExecutionKind?: 'safe_reply' | 'action';
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
  // requestSummary, never aiSummary. The episode summary describes everything
  // said in this conversation; handing it to the planner as an instruction is
  // how a shopper who wrote "Hi" got a plan about the refund they asked for
  // three days earlier. When no request has been summarised yet the generic
  // instruction is correct — the planner still reads the messages themselves.
  const instruction = options.instruction?.trim()
    || thread.requestSummary
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

  const latestConversation = await getLatestConversationMessage(threadId, organizationId);
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
    select: { name: true, settings: true },
  });

  const replyBlock = emailReplyBlock(thread);
  if (replyBlock) {
    if (thread.cachedPlan || thread.cachedPlanMessageId) {
      await clearThreadPlanCache({ orgId: organizationId, threadId });
    }
    if (!thread.escalatedAt) {
      const escalation = await gatewayThreadSink.escalateToHuman(
        { reason: replyBlock.reason },
        {
          orgId: organizationId,
          orgName: org?.name ?? 'Workspace',
          threadId,
        },
      );
      if (escalation.status === 'error') {
        throw new Error(`Could not escalate thread with an unavailable reply integration: ${escalation.message}`);
      }
    }
    logger.warn(
      {
        organizationId,
        threadId,
        replyIntegrationId: thread.replyIntegrationId,
        reasonCode: replyBlock.code,
      },
      '[gateway:auto-plan] Refusing to plan for an unavailable email reply integration',
    );
    return { plan: null, instruction };
  }

  const settings = resolveAgentSettings(org?.settings as Partial<OrgSettings> | null);

  // P5-04: an escalated ticket is flagged for a human. Keep planning and
  // notifying the merchant, but never autonomously execute on it until the
  // escalation flag is cleared — bias to escalation over confident wrong action.
  const autonomousWorkAllowed = !thread.escalatedAt;

  const cached = readAgentPlanCache(thread.cachedPlan);
  if (isAgentPlanCacheHit({
    cache: cached,
    instruction,
    lastCustomerMessageId: pendingCustomerMessageId,
    settings,
  })) {
    if (cached?.planId && (cached.plan.steps.length > 0 || cached.plan.validation?.status === 'invalid')) {
      void captureAgentPlanGenerated({
        cacheHit: true,
        channel: thread.channelType,
        generationMs: Date.now() - generationStartedAt,
        organizationId,
        planId: cached.planId,
        stepCount: cached.plan.steps.length,
      });
    }
    const autoExecution = autonomousWorkAllowed
      ? await buildAutoExecutionResult(organizationId, threadId, settings, allowAutoExecute)
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

  if (cacheRecord.planId) {
    await captureCommittedPlanOutcome({
      orgId: organizationId,
      thread: {
        id: thread.id,
        customerId: thread.customerId,
        channelType: thread.channelType,
        tag: thread.tag,
        requestDisposition: thread.requestDisposition,
        classifierSignals: thread.classifierSignals,
        filterStatus: thread.filterStatus,
        escalatedAt: thread.escalatedAt,
      },
      sourceMessageId: pendingCustomerMessageId,
      planId: cacheRecord.planId,
      instruction,
      plan,
      settings,
      allowMutativeAutoExecute: allowAutoExecute,
    });
  }

  // Live inbox: a fresh plan is cached — push so the "Needs you" card appears.
  await publishThreadEvent(organizationId, threadId);

  if (cacheRecord.planId && (plan.steps.length > 0 || plan.validation?.status === 'invalid')) {
    void captureAgentPlanGenerated({
      cacheHit: false,
      channel: thread.channelType,
      generationMs: Date.now() - generationStartedAt,
      organizationId,
      planId: cacheRecord.planId,
      stepCount: plan.steps.length,
    });
  }

  const autoExecution = autonomousWorkAllowed
    ? await buildAutoExecutionResult(organizationId, threadId, settings, allowAutoExecute)
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
  allowMutativeAutoExecute: boolean,
): Promise<Partial<GeneratedThreadPlan>> {
  const executed = await maybeAutoExecuteCurrentCachedHomePlan(
    {
      orgId: organizationId,
      threadId,
      settings,
      failureRoute: FAILURE_ROUTE,
      allowMutativeAutoExecute,
    },
    buildGatewayPlanExecutionDeps(),
  );
  if (!executed) {
    return {};
  }

  // A previously parked card may still exist when recovery executes an older
  // safe reply. Remove it across operator channels so a later "yes" cannot act
  // on work the agent already completed (or attempted and reported as failed).
  await removePendingPlanForThread(organizationId, threadId);

  const failed = findFailedToolResult(executed.result);
  return {
    autoExecuted: true,
    autoExecutionKind: executed.verdict.kind === 'quick_reply' ? 'safe_reply' : 'action',
    autoExecutionStatus: failed ? 'error' : 'success',
    autoExecutionSummary: executed.result.summary,
    autoExecutionActions: executed.result.actionsPerformed,
    ...(failed ? { autoExecutionError: failed.result } : {}),
  };
}

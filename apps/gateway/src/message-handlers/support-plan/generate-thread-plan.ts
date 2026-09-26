import { db } from '@shopkeeper/db';
import { requireOrgThread, getLatestConversationMessage } from '@shopkeeper/agent/thread-auth';
import { buildContext } from '@shopkeeper/agent/build-context';
import { planAgent, usesExactDraftProposals } from '@shopkeeper/agent/planner';
import { resolveAgentRuntimeVersionForOrg } from '@shopkeeper/agent/runtime-modes';
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
  supportAttemptSettlement,
} from '@shopkeeper/agent/plan-execution';
import type { DurableTurnIdentity } from '@shopkeeper/agent/plan-execution';
import { getPendingCustomerMessageId } from '@shopkeeper/agent/plan-cache-shape';
import {
  acceptCustomerAgentRequest,
  claimAgentTask,
  failAgentTaskClaim,
  recordAgentTaskModelUsage,
  reserveAgentTaskModelCall,
  settleAgentTaskClaim,
} from '@shopkeeper/agent/task-ledger';
import { estimateModelUsageCostUsd, UnknownModelPriceError } from '@shopkeeper/agent/model-cost';
import type { TaskModelBudget } from '@shopkeeper/agent/context';
import { shouldSkipAutoPlan } from '@shopkeeper/agent/sender-trust';
import { hashInstruction, hashPlan } from '@shopkeeper/agent/agent-actions';
import { CHANNEL_TYPE } from '@shopkeeper/agent/thread-constants';
import type { AgentPlan as PackageAgentPlan, OrgSettings } from '@shopkeeper/agent/types';
import { parseClassifierSignals } from '@shopkeeper/agent/classifier-signals';
import { getEmailProvider } from '@shopkeeper/email/providers';
import type { AgentPlan } from '../../types.js';
import { toGatewayAgentPlan } from './agent-plan-adapter.js';
import { gatewayThreadSink } from './agent-thread-sink.js';
import { buildGatewayPlanExecutionDeps } from '../operator/agent-turn-deps.js';
import type { AgentActionResult, PlanIdentity } from './planning-types.js';
import { publishThreadEvent } from '../../realtime/publish.js';
import { captureAgentPlanGenerated } from '../../product-analytics.js';
import logger from '../../logger.js';
import { removePendingPlanForThread } from '../../operator-context.js';
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
  failureReplanRecovered?: boolean;
  failureReplanAwaitingApproval?: boolean;
  failureReplanFailureTool?: string;
  failureReplanFailureReason?: string;
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

  // Everything above is the decision to do agent work at all — a filtered
  // sender, a superseded job, an answered thread and an unroutable mailbox each
  // leave before a request exists, because none of them is a request the agent
  // accepted. From here the customer's message is durable work.
  const selectedRuntimeVersion = resolveAgentRuntimeVersionForOrg(organizationId);
  const durableResult = await openDurableSupportTask({
    organizationId,
    threadId,
    sourceMessageId: pendingCustomerMessageId,
    objective: instruction,
    continuity: parseClassifierSignals(thread.classifierSignals)?.requestFacts,
    runtimeVersion: selectedRuntimeVersion,
    ...(selectedRuntimeVersion >= 2 ? { continuityMode: 'classified' as const } : {}),
  });
  const scope: PlanAttemptScope = {
    organizationId, threadId, allowAutoExecute, instruction, thread, settings,
    pendingCustomerMessageId, generationStartedAt,
    ...(durableResult.kind === 'claimed' ? { durableTurn: {
      requestId: durableResult.claim.requestId,
      taskId: durableResult.claim.taskId,
      runtimeVersion: durableResult.claim.runtimeVersion,
      expectedRevision: durableResult.claim.expectedRevision,
      claimToken: durableResult.claim.claimToken,
    } } : {}),
  };
  if (durableResult.kind === 'not_owned') return readCurrentPlanWithoutWork(scope);
  const durable = durableResult.claim;
  try {
    const generated = await runPlanAttempt(scope);
    await settleDurableSupportTask(durable, scope, generated);
    return generated;
  } catch (error) {
    await failDurableSupportTask(durable, 'plan_attempt_failed');
    throw error;
  }
}

function readCurrentPlanWithoutWork(scope: PlanAttemptScope): GeneratedThreadPlan {
  const cached = readAgentPlanCache(scope.thread.cachedPlan);
  if (!isAgentPlanCacheHit({
    cache: cached,
    instruction: scope.instruction,
    lastCustomerMessageId: scope.pendingCustomerMessageId,
    settings: scope.settings,
  })) return { plan: null, instruction: scope.instruction };
  return {
    plan: toGatewayAgentPlan(cached?.plan ?? null),
    instruction: scope.instruction,
    ...(cached?.plan ? {
      identity: planIdentity({
        planId: cached.planId,
        sourceMessageId: cached.lastCustomerMessageId,
        instruction: cached.instruction,
        plan: cached.plan,
      }),
      merchantQuestion: merchantQuestionFor(cached.plan, scope.settings),
    } : {}),
  };
}

interface PlanAttemptScope {
  organizationId: string;
  threadId: string;
  allowAutoExecute: boolean;
  instruction: string;
  thread: Awaited<ReturnType<typeof requireOrgThread>>;
  settings: OrgSettings;
  pendingCustomerMessageId: string;
  generationStartedAt: number;
  durableTurn?: DurableTurnIdentity;
}

function supportTaskModelBudget(
  organizationId: string,
  durableTurn?: DurableTurnIdentity,
): TaskModelBudget | undefined {
  if (!durableTurn || durableTurn.expectedRevision === undefined || !durableTurn.claimToken) {
    return undefined;
  }
  const claim = {
    organizationId,
    taskId: durableTurn.taskId,
    expectedRevision: durableTurn.expectedRevision,
    claimToken: durableTurn.claimToken,
  };
  return {
    reserveModelCall: async () => {
      const state = await reserveAgentTaskModelCall(claim);
      if (state !== 'active') throw new Error(`Task stopped: ${state}.`);
    },
    recordModelUsage: async (usage, model) => {
      let spentNanoUsd = 0n;
      try {
        spentNanoUsd = BigInt(Math.ceil(estimateModelUsageCostUsd(model, usage) * 1_000_000_000));
      } catch (error) {
        if (!(error instanceof UnknownModelPriceError)) throw error;
        logger.warn(
          { model, taskId: durableTurn.taskId },
          '[gateway:auto-plan] Unpriced model; call counted without spend',
        );
      }
      const recorded = await recordAgentTaskModelUsage({
        ...claim,
        usage: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, spentNanoUsd },
      });
      if (!recorded) throw new Error('Task claim was lost while recording model usage.');
    },
  };
}

// The plan attempt itself: serve a warm cache or plan and cache a fresh one,
// then auto-execute within business hours. Unchanged by the task around it
// except that its executions name the request they belong to.
async function runPlanAttempt(scope: PlanAttemptScope): Promise<GeneratedThreadPlan> {
  const {
    organizationId, threadId, allowAutoExecute, instruction, thread, settings,
    pendingCustomerMessageId, generationStartedAt,
  } = scope;

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
      ? await buildAutoExecutionResult(scope)
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
  const taskBudget = supportTaskModelBudget(organizationId, scope.durableTurn);
  if (taskBudget) ctx.taskBudget = taskBudget;
  const plan = await planAgent(
    ctx,
    instruction,
    settings,
    {
      ...(usesExactDraftProposals(scope.durableTurn?.runtimeVersion) ? { exactDraftProposal: true } : {}),
      ...(scope.durableTurn?.runtimeVersion !== undefined
        ? { runtimeVersion: scope.durableTurn.runtimeVersion }
        : {}),
    },
  );
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
    ? await buildAutoExecutionResult(scope)
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
  scope: PlanAttemptScope,
): Promise<Partial<GeneratedThreadPlan>> {
  const { organizationId, threadId, settings } = scope;
  const executed = await maybeAutoExecuteCurrentCachedHomePlan(
    {
      orgId: organizationId,
      threadId,
      settings,
      failureRoute: FAILURE_ROUTE,
      allowMutativeAutoExecute: scope.allowAutoExecute,
      ...(scope.durableTurn ? { durableTurn: scope.durableTurn } : {}),
    },
    buildGatewayPlanExecutionDeps(supportTaskModelBudget(organizationId, scope.durableTurn)),
  );
  if (!executed) {
    return {};
  }

  // A previously parked card may still exist when recovery executes an older
  // safe reply. Remove it across operator channels so a later "yes" cannot act
  // on work the agent already completed (or attempted and reported as failed).
  await removePendingPlanForThread(organizationId, threadId);

  const recovery = executed.failureReplanRecovery;
  const awaitingApproval = executed.failureReplanAwaitingApproval;
  const failed = recovery ? null : findFailedToolResult(executed.result);
  return {
    autoExecuted: true,
    autoExecutionKind: executed.verdict.kind === 'quick_reply' ? 'safe_reply' : 'action',
    autoExecutionStatus: failed ? 'error' : 'success',
    autoExecutionSummary: executed.result.summary,
    autoExecutionActions: recovery
      ? [...recovery.parentResult.actionsPerformed, ...executed.result.actionsPerformed]
      : executed.result.actionsPerformed,
    ...(failed ? { autoExecutionError: failed.result } : {}),
    ...(recovery ? {
      failureReplanRecovered: true,
      failureReplanFailureTool: recovery.context.failureTool,
      failureReplanFailureReason: recovery.context.failureReason,
    } : {}),
    ...(awaitingApproval ? {
      failureReplanAwaitingApproval: true,
      failureReplanFailureTool: awaitingApproval.context.failureTool,
      failureReplanFailureReason: awaitingApproval.context.failureReason,
      // The child is the thread's current plan now, so the card the merchant
      // approves must be the child's, not the parent's that just failed.
      plan: toGatewayAgentPlan(awaitingApproval.plan),
      identity: planIdentity({
        planId: awaitingApproval.planId,
        sourceMessageId: awaitingApproval.sourceMessageId,
        instruction: executed.instruction,
        plan: awaitingApproval.plan,
      }),
    } : {}),
  };
}

// One support attempt: plan, notify, and auto-execute what autonomy allows. The
// lease covers the whole thing rather than one model call, because the planning
// job is the only worker that will ever hold this task.
const SUPPORT_TASK_LEASE_MS = 300_000;
// Planning and bounded replanning reserve model calls and record measured usage
// against these persisted task limits. Active time is charged on settlement.
function supportTaskBudget(runtimeVersion: number) {
  return {
    runtimeVersion,
    modelCallLimit: 20,
    activeTimeMsLimit: 300_000,
    spendNanoUsdLimit: 1_000_000_000n,
  } as const;
}

interface DurableSupportTask {
  requestId: string;
  taskId: string;
  organizationId: string;
  expectedRevision: number;
  claimToken: string;
  runtimeVersion: number;
}

/**
 * Puts the customer's message on the thread's durable task and claims it for
 * this attempt. A non-owner may only return the already-cached result for this
 * exact message; it must not repeat planning or execution outside the claim.
 *
 * Accepting is durable and claiming is deliberately not retried here. Ledger
 * failures fail the job so normal queue retry/recovery remains the sole owner of
 * the work instead of silently degrading to an untracked attempt.
 */
async function openDurableSupportTask(input: {
  organizationId: string;
  threadId: string;
  sourceMessageId: string;
  objective: string;
  runtimeVersion: number;
  continuity?: { ask: string; order: string | null; subject: string | null };
  continuityMode?: 'classified';
}): Promise<{ kind: 'claimed'; claim: DurableSupportTask } | { kind: 'not_owned' }> {
  const { request, task } = await acceptCustomerAgentRequest({
    ...input, budget: supportTaskBudget(input.runtimeVersion),
  });
  const claimed = await claimAgentTask({
    organizationId: input.organizationId,
    taskId: task.id,
    expectedRevision: task.revision,
    leaseMs: SUPPORT_TASK_LEASE_MS,
  });
  if (!claimed) {
    logger.info(
      { organizationId: input.organizationId, threadId: input.threadId, taskId: task.id },
      '[gateway:auto-plan] Support task is already owned or settled',
    );
    return { kind: 'not_owned' };
  }
  return {
    kind: 'claimed',
    claim: {
      requestId: request.id,
      taskId: task.id,
      organizationId: input.organizationId,
      expectedRevision: task.revision,
      claimToken: claimed.claimToken,
      runtimeVersion: task.runtimeVersion,
    },
  };
}

async function settleDurableSupportTask(
  durable: DurableSupportTask,
  scope: PlanAttemptScope,
  generated: GeneratedThreadPlan,
): Promise<void> {
  try {
    const waitingReply = generated.plan?.rawToolCalls.find(call => (
      call.name === 'send_reply'
      && call.input
      && typeof call.input === 'object'
      && !Array.isArray(call.input)
      && (call.input as { await_response?: unknown }).await_response === true
    ));
    const waitingReplyText = waitingReply?.input
      && typeof waitingReply.input === 'object'
      && !Array.isArray(waitingReply.input)
      && typeof (waitingReply.input as { text?: unknown }).text === 'string'
      ? (waitingReply.input as { text: string }).text.trim()
      : '';
    const customerQuestion = generated.autoExecuted
      && generated.autoExecutionActions?.some(action => (
        action.tool === 'send_reply' && action.status === 'success'
      ))
      ? waitingReplyText || null
      : null;
    const settled = await settleAgentTaskClaim({
      organizationId: durable.organizationId,
      taskId: durable.taskId,
      expectedRevision: durable.expectedRevision,
      claimToken: durable.claimToken,
      requestId: durable.requestId,
      settlement: await supportAttemptSettlement({
        orgId: scope.organizationId,
        threadId: scope.threadId,
        settings: scope.settings,
        allowMutativeAutoExecute: scope.allowAutoExecute,
        merchantQuestion: generated.merchantQuestion ?? null,
        customerQuestion,
        sourceRequestIds: [durable.requestId],
      }),
    });
    if (!settled) {
      logger.warn(
        { taskId: durable.taskId, organizationId: durable.organizationId },
        '[gateway:auto-plan] Support task claim was lost before settlement',
      );
    }
  } catch (err) {
    // The plan is cached and anything it executed is recorded. Losing the
    // settlement leaves the task claimed, which the lease sweep reconciles; it
    // must not turn a delivered plan into a failed job.
    logger.error(
      { err, taskId: durable.taskId, organizationId: durable.organizationId },
      '[gateway:auto-plan] Could not settle support task',
    );
  }
}

async function failDurableSupportTask(
  durable: DurableSupportTask,
  failureCode: string,
): Promise<void> {
  try {
    await failAgentTaskClaim({
      organizationId: durable.organizationId,
      taskId: durable.taskId,
      expectedRevision: durable.expectedRevision,
      claimToken: durable.claimToken,
      requestId: durable.requestId,
      failureCode,
    });
  } catch (err) {
    logger.error(
      { err, taskId: durable.taskId, organizationId: durable.organizationId },
      '[gateway:auto-plan] Could not record support task failure',
    );
  }
}

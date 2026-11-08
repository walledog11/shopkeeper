import { executeAgentTurn } from "../turn.js";
import { requireOrgThread } from "../thread-auth.js";
import { isEscalationOnlyPlan } from "../autonomy.js";
import logger from "../logger.js";
import { shouldSkipAutoPlan } from "../sender-trust.js";
import {
  isDefinitePlanExecutionFailure,
  isUnknownPlanExecution,
  ledgerStatusForPlanOutcome,
  planExecutionOutcomeForResult,
  withheldApprovedMessage,
} from "../execution-outcome.js";
import { attemptFailureReplanAfterExecution, escalateThreadForUnknownPlanExecution } from "../plan-failure-replan.js";
import type { AgentResult } from "../agent-context.js";
import type { OrgSettings } from "../types.js";
import { completePlanExecution } from "../execution-ledger.js";
import { recordRequestEpisodeExecution } from "../request-outcome.js";
import {
  type PlanExecutionDeps,
  type ExecutedCachedPlan,
  type DurableTurnIdentity,
  type CachedPlanExecutionParams,
} from "./types.js";
import { isAutoExecuteEnabled } from "./validation.js";
import { loadCurrentCachedHomePlan } from "./plan-source.js";
import { consumeThreadCachedPlan } from "./cache.js";
import { preparePlanExecution } from "./prepare.js";

function terminalStatusForResult(result: AgentResult): "committed" | "failed" | "unknown" {
  return ledgerStatusForPlanOutcome(planExecutionOutcomeForResult(result));
}

function executionError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function executeCurrentCachedHomePlan(params: CachedPlanExecutionParams, deps: PlanExecutionDeps): Promise<ExecutedCachedPlan> {
  const { current, approvedCommunication, auditMode, authorized, approvedToolCalls, executionInstruction, approval, approvedTurnId, executionId, claimToken, proposalBacked, merchantAnswers } = await preparePlanExecution(params);

  let result: AgentResult;
  let terminalExecutionStatus: "committed" | "failed" | "unknown" = "committed";
  try {
    result = await executeAgentTurn({
      orgId: params.orgId,
      threadId: params.threadId,
      instruction: executionInstruction,
      failureRoute: params.failureRoute,
      orgSettings: params.settings,
      approvedToolCalls,
      persistAuditNote: true,
      auditMode,
      ...(params.durableTurn ? {
        turnId: params.durableTurn.requestId,
        agentRequestId: params.durableTurn.requestId,
        agentTaskId: params.durableTurn.taskId,
        taskAuthority: {
          kind: "claim" as const,
          taskId: params.durableTurn.taskId,
          expectedRevision: params.durableTurn.expectedRevision,
          claimToken: params.durableTurn.claimToken,
        },
      } : {}),
      // An approved run belongs to the task that parked the proposal, so its
      // messages name that task. `agentRequestId` is deliberately not set: the
      // reply answers the task, not one inbound message of it.
      ...(authorized && approvedTurnId
        ? {
            turnId: approvedTurnId,
            agentTaskId: authorized.taskId,
            ...(executionId && claimToken ? {
              taskAuthority: {
                kind: "approved_proposal" as const,
                taskId: authorized.taskId,
                expectedRevision: authorized.taskRevision,
                proposalId: authorized.proposalId,
                executionId,
                executionClaimToken: claimToken,
              },
            } : {}),
          }
        : {}),
      ...(executionId ? { executionId } : {}),
      // The same snapshot validateApprovedCommunication checked the calls
      // against, and the one the approval hash binds.
      ...(approvedCommunication ? { approvedCommunication } : {}),
      ...(merchantAnswers ? { merchantAnswers } : {}),
      ...(approval ? { approval } : {}),
    }, deps);
    terminalExecutionStatus = terminalStatusForResult(result);
    if (executionId && claimToken) {
      await completePlanExecution({
        executionId,
        claimToken,
        status: terminalExecutionStatus,
        error: findFailedToolResult(result)?.result ?? null,
        // Only a durable proposal that bound an exact draft owes the customer a
        // follow-up; automatic work retains its bounded child replan below.
        ...(proposalBacked && approvedCommunication?.mode === "exact_draft"
          ? { withheldMessage: withheldApprovedMessage(result.actionsPerformed) }
          : {}),
      });
    }
  } catch (error) {
    // A whole-turn throw can occur after a provider accepted a mutation. Until
    // P3 reconciliation can prove otherwise, preserve the ambiguity as unknown
    // and never make the reviewed plan claimable again.
    if (executionId && claimToken) {
      terminalExecutionStatus = "unknown";
      await completePlanExecution({
        executionId,
        claimToken,
        status: terminalExecutionStatus,
        error: executionError(error),
      }).catch(() => undefined);
    }
    // The merchant hears about the unknown outcome before anything is recorded
    // about it.
    await escalateThreadForUnknownPlanExecution({
      orgId: params.orgId,
      threadId: params.threadId,
      reason: executionError(error),
    });
    if (current.planId) {
      await recordRequestEpisodeExecution({
        orgId: params.orgId,
        planId: current.planId,
        planExecutionId: executionId ?? null,
        executionStatus: "unknown",
        executionIntent: params.executionIntent,
        planVerdict: current.verdict.kind,
      });
    }
    throw error;
  } finally {
    await consumeThreadCachedPlan({
      orgId: params.orgId,
      threadId: params.threadId,
      lastCustomerMessageId: current.lastCustomerMessageId,
      expectedPlanId: current.planId,
    });
  }

  if (current.planId) {
    await recordRequestEpisodeExecution({
      orgId: params.orgId,
      planId: current.planId,
      planExecutionId: executionId ?? null,
      executionStatus: terminalExecutionStatus,
      executionIntent: params.executionIntent,
      planVerdict: current.verdict.kind,
    });
  }

  const executionOutcome = planExecutionOutcomeForResult(result);
  if (isUnknownPlanExecution(executionOutcome)) {
    await escalateThreadForUnknownPlanExecution({
      orgId: params.orgId,
      threadId: params.threadId,
      reason: findFailedToolResult(result)?.result ?? "Unknown provider outcome during plan execution.",
    });
    return {
      ...current,
      plan: current.plan,
      approvedToolCalls,
      execution: {
        id: executionId ?? null,
        status: executionOutcome,
      },
      result,
    };
  }

  const failureReplanAllowed = params.failureReplanAllowed !== false
    && !current.failureReplan
    && !authorized
    && Boolean(deps.planAgent);
  if (
    failureReplanAllowed
    && isDefinitePlanExecutionFailure(executionOutcome)
    && deps.planAgent
    && current.lastCustomerMessageId
  ) {
    // The parent's side effects are already committed. Nothing below may throw
    // them away, so a replan that fails for any reason degrades to reporting
    // the parent result rather than surfacing an error to the approver.
    try {
      const attempt = await attemptFailureReplanAfterExecution({
        orgId: params.orgId,
        threadId: params.threadId,
        settings: params.settings,
        instruction: current.instruction,
        sourceMessageId: current.lastCustomerMessageId,
        parentPlanId: current.planId,
        parentPlan: current.plan,
        approvedToolCalls,
        result,
        allowMutativeAutoExecute: params.allowMutativeAutoExecute,
        runtimeVersion: params.durableTurn?.runtimeVersion,
        buildContext: deps.buildContext,
        planAgent: deps.planAgent,
      });

      if (attempt?.status === "executable") {
        // The child shares none of the parent's tool calls or plan identity, so
        // the parent's approval envelope — approvedToolCalls, expectedIdentity,
        // approver — cannot travel with it. Everything it inherits is listed
        // here; it runs on the authority its own verdict grants, which is why
        // the intent is automatic. It does retain the durable task claim:
        // operation IDs, rather than model tool-call IDs or action indexes, are
        // the write identity, and recovery must find every child action from
        // the task that authorized this bounded replan.
        const childExecuted = await executeCurrentCachedHomePlan({
          orgId: params.orgId,
          threadId: params.threadId,
          settings: params.settings,
          executionIntent: "automatic",
          failureRoute: params.failureRoute,
          ...(params.allowMutativeAutoExecute !== undefined
            ? { allowMutativeAutoExecute: params.allowMutativeAutoExecute }
            : {}),
          failureReplanAllowed: false,
          ...(params.durableTurn ? { durableTurn: params.durableTurn } : {}),
        }, deps);
        return {
          ...childExecuted,
          failureReplanRecovery: {
            parentResult: result,
            parentPlan: current.plan,
            context: attempt.context,
          },
        };
      }

      if (attempt?.status === "awaiting_approval") {
        return {
          ...current,
          plan: current.plan,
          approvedToolCalls,
          execution: { id: executionId ?? null, status: executionOutcome },
          result,
          failureReplanAwaitingApproval: {
            planId: attempt.cache.planId,
            sourceMessageId: attempt.cache.lastCustomerMessageId,
            plan: attempt.cache.plan,
            context: attempt.context,
          },
        };
      }
    } catch (replanError) {
      logger.warn({
        orgId: params.orgId,
        threadId: params.threadId,
        planId: current.planId,
        error: executionError(replanError),
      }, "[agent] failure replan did not complete; reporting the parent result");
    }
  }

  return {
    ...current,
    plan: current.plan,
    approvedToolCalls,
    execution: {
      id: executionId ?? null,
      status: planExecutionOutcomeForResult(result),
    },
    result,
  };
}

export async function maybeAutoExecuteCurrentCachedHomePlan(params: {
  orgId: string;
  threadId: string;
  settings: OrgSettings;
  failureRoute: string;
  /** Business-hours and rollout gate for plans that mutate store state. */
  allowMutativeAutoExecute?: boolean;
  durableTurn?: DurableTurnIdentity;
}, deps: PlanExecutionDeps): Promise<ExecutedCachedPlan | null> {
  const thread = await requireOrgThread(params.threadId, params.orgId);
  if (shouldSkipAutoPlan(thread.filterStatus)) {
    return null;
  }

  const current = await loadCurrentCachedHomePlan(params, thread);
  if (!current.plan) {
    return null;
  }

  // A structurally clean quick reply is the low-risk conversational lane: one
  // customer-facing send, optional reads, no mutation, no merchant question and
  // no blocking signal. It is ordinary support work, so every tier except the
  // explicit Draft only tier (which classifies it as needs_review) sends it
  // without consuming merchant attention. The mutative rollout switch below is
  // deliberately irrelevant here; turning on clarifying questions must not turn
  // on refunds or order changes.
  // A handoff cannot wait for the merchant to approve taking over. It uses the
  // same execution claim as other plans, independently of store-write rollout.
  if (current.verdict.kind === "quick_reply"
    || (current.verdict.kind === "escalate" && isEscalationOnlyPlan(current.plan.rawToolCalls))) {
    return executeCurrentCachedHomePlan({
      ...params,
      executionIntent: "automatic",
    }, deps);
  }

  if (current.verdict.kind !== "auto_execute" || params.allowMutativeAutoExecute === false) {
    return null;
  }

  if (!isAutoExecuteEnabled(params.settings)) {
    return null;
  }

  return executeCurrentCachedHomePlan({
    ...params,
    executionIntent: "automatic",
  }, deps);
}

export function findFailedToolResult(result: AgentResult): { tool: string; result: string } | null {
  return result.actionsPerformed.find((action) => (
    action.status === "error" || action.status === "policy_block" || action.status === "unknown"
  )) ?? null;
}

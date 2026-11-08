import { type DbChannelType } from "@shopkeeper/db";
import { type ExecuteAgentTurnDeps } from "../turn.js";
import { requireOrgThread } from "../thread-auth.js";
import type { PlanFailureReplanContext } from "../plan-cache-shape.js";
import { type AutonomyVerdict } from "../autonomy.js";
import { type PlanAgentFn } from "../plan-failure-replan.js";
import type { AgentResult } from "../agent-context.js";
import type { AgentPlan, MerchantAnswers, OrgSettings, PlanExecutionOutcome, RawToolCall } from "../types.js";

export type PlanExecutionDeps = ExecuteAgentTurnDeps & {
  planAgent?: PlanAgentFn;
};

export interface ApproverIdentity {
  clerkUserId: string;
  displayName: string | null;
}

export interface CurrentCachedPlan {
  channel: DbChannelType;
  instruction: string;
  lastCustomerMessageId: string | null;
  planId: string | null;
  plan: AgentPlan | null;
  verdict: AutonomyVerdict;
  failureReplan: PlanFailureReplanContext | null;
  /** Exact identity was already checked against the durable v2 proposal. */
  durableProposal?: boolean;
}

export interface FailureReplanRecovery {
  parentResult: AgentResult;
  parentPlan: AgentPlan;
  context: PlanFailureReplanContext;
}

/**
 * A child plan was drafted after a definite parent failure but cannot run on
 * its own authority, so it waits on the thread for the merchant to approve it.
 */
export interface FailureReplanAwaitingApproval {
  planId: string | null;
  sourceMessageId: string | null;
  plan: AgentPlan;
  context: PlanFailureReplanContext;
}

export interface ExecutedCachedPlan extends CurrentCachedPlan {
  plan: AgentPlan;
  approvedToolCalls: RawToolCall[];
  execution: {
    id: string | null;
    status: PlanExecutionOutcome;
  };
  result: AgentResult;
  failureReplanRecovery?: FailureReplanRecovery;
  failureReplanAwaitingApproval?: FailureReplanAwaitingApproval;
}

export interface ExpectedPlanIdentity {
  planId?: string | null;
  sourceMessageId?: string | null;
  planHash?: string | null;
  instructionHash?: string | null;
}

export type PlanExecutionLedgerMode = "off" | "enforce";

export type ExecutionIntent = "automatic" | "merchant_approved";

export type OrgThread = Awaited<ReturnType<typeof requireOrgThread>>;

/**
 * Ties one execution to the durable request and task that authorized it. The
 * turn ID is the request ID because that is how `settleAgentTaskClaim` finds the
 * actions this attempt wrote and links them to the task; it is not a second
 * identity to keep in step.
 */
export interface DurableTurnIdentity {
  requestId: string;
  taskId: string;
  runtimeVersion: number;
  expectedRevision: number;
  claimToken: string;
}

export interface CachedPlanExecutionParams {
  orgId: string;
  threadId: string;
  settings: OrgSettings;
  executionIntent: ExecutionIntent;
  failureRoute: string;
  approver?: ApproverIdentity;
  approvedToolCalls?: RawToolCall[];
  expectedIdentity?: ExpectedPlanIdentity;
  allowMutativeAutoExecute?: boolean;
  /** When false, suppresses the one bounded child replan after a definite failure. */
  failureReplanAllowed?: boolean;
  /** The durable task this execution belongs to, for hosts that have one. */
  durableTurn?: DurableTurnIdentity;
  /**
   * The merchant's values for the approved message's blanks. A plan with a
   * blank runs only on a merchant's approval that fills every one.
   */
  merchantAnswers?: MerchantAnswers;
}

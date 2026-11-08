// Public plan-execution API. Validation, claims, cache writes, and dispatch have separate owners.
export {
  type PlanExecutionDeps,
  type ApproverIdentity,
  type FailureReplanRecovery,
  type FailureReplanAwaitingApproval,
  type ExpectedPlanIdentity,
  type PlanExecutionLedgerMode,
  type ExecutionIntent,
  type DurableTurnIdentity,
} from "./execution/types.js";
export {
  formatApproverId,
  resolvePlanExecutionLedgerMode,
  isAutoExecuteEnabled,
  getExecutablePlanToolCalls,
  validateCustomerFacingApprovalSet,
} from "./execution/validation.js";
export {
  readParkedProposalForThread,
  supportAttemptSettlement,
} from "./execution/plan-source.js";
export {
  consumeThreadCachedPlan,
  clearThreadPlanCache,
  dismissCurrentCachedPlan,
} from "./execution/cache.js";
export {
  executeCurrentCachedHomePlan,
  maybeAutoExecuteCurrentCachedHomePlan,
  findFailedToolResult,
} from "./execution/run.js";

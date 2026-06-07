// Host wrapper — core auto-execute orchestration moved to @shopkeeper/agent/plan-execution
// (Track 4.1). The dashboard injects its turn seams (Upstash lock, io-sink context,
// ops-alert runAgent) plus the real AutonomyShadowDecision recorder. The pure
// helpers move with the core and are re-exported for unchanged call sites.
import {
  executeCurrentCachedHomePlan as coreExecuteCurrentCachedHomePlan,
  maybeAutoExecuteCurrentCachedHomePlan as coreMaybeAutoExecuteCurrentCachedHomePlan,
  type PlanExecutionDeps,
  type ApproverIdentity,
} from "@shopkeeper/agent/plan-execution";
import { buildDashboardTurnDeps } from "@/lib/agent/api/turn-deps";
import { recordShadowDecision, resolveShadowDecisionOnApproval } from "@/lib/agent/api/autonomy-shadow";
import type { HomePlanKind } from "@shopkeeper/agent/plan-preview";
import type { AgentFailureAlertRoute } from "@/lib/server/agent-failure-alerts";
import type { OrgSettings } from "@/types";

export {
  formatApproverId,
  isAutoExecuteEnabled,
  getExecutablePlanToolCalls,
  findFailedToolResult,
} from "@shopkeeper/agent/plan-execution";
export type { ApproverIdentity } from "@shopkeeper/agent/plan-execution";

function dashboardPlanExecutionDeps(): PlanExecutionDeps {
  return {
    ...buildDashboardTurnDeps(),
    shadow: { recordShadowDecision, resolveShadowDecisionOnApproval },
  };
}

export function executeCurrentCachedHomePlan(params: {
  orgId: string;
  threadId: string;
  settings: OrgSettings;
  allowedKinds: HomePlanKind[];
  failureRoute: AgentFailureAlertRoute;
  approver?: ApproverIdentity;
}) {
  return coreExecuteCurrentCachedHomePlan(params, dashboardPlanExecutionDeps());
}

export function maybeAutoExecuteCurrentCachedHomePlan(params: {
  orgId: string;
  threadId: string;
  settings: OrgSettings;
  failureRoute: AgentFailureAlertRoute;
}) {
  return coreMaybeAutoExecuteCurrentCachedHomePlan(params, dashboardPlanExecutionDeps());
}

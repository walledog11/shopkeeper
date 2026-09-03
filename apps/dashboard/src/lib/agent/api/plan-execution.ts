// Host wrapper — core auto-execute orchestration moved to @shopkeeper/agent/plan-execution
// (Track 4.1). The dashboard injects its turn seams (Upstash lock, io-sink context,
// ops-alert runAgent).
import {
  executeCurrentCachedHomePlan as coreExecuteCurrentCachedHomePlan,
  type ApproverIdentity,
  type ExecutionIntent,
  type ExpectedPlanIdentity,
  type PlanExecutionDeps,
} from "@shopkeeper/agent/plan-execution";
import { planAgent } from "@shopkeeper/agent/planner";
import { buildDashboardTurnDeps } from "@/lib/agent/api/turn-deps";
import type { AgentFailureAlertRoute } from "@/lib/server/agent-failure-alerts";
import type { OrgSettings } from "@/types";
import type { RawToolCall } from "@shopkeeper/agent/types";

function buildDashboardPlanExecutionDeps(): PlanExecutionDeps {
  return {
    ...buildDashboardTurnDeps(),
    planAgent,
  };
}

export function executeCurrentCachedHomePlan(params: {
  orgId: string;
  threadId: string;
  settings: OrgSettings;
  executionIntent: ExecutionIntent;
  failureRoute: AgentFailureAlertRoute;
  approver?: ApproverIdentity;
  approvedToolCalls?: RawToolCall[];
  expectedIdentity?: ExpectedPlanIdentity;
}) {
  return coreExecuteCurrentCachedHomePlan(params, buildDashboardPlanExecutionDeps());
}

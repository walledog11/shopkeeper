// Host wrapper — core auto-execute orchestration moved to @shopkeeper/agent/plan-execution
// (Track 4.1). The dashboard injects its turn seams (Upstash lock, io-sink context,
// ops-alert runAgent).
import {
  executeCurrentCachedHomePlan as coreExecuteCurrentCachedHomePlan,
  maybeAutoExecuteCurrentCachedHomePlan as coreMaybeAutoExecuteCurrentCachedHomePlan,
  type ApproverIdentity,
  type ExecutionIntent,
  type ExpectedPlanIdentity,
} from "@shopkeeper/agent/plan-execution";
import { buildDashboardTurnDeps } from "@/lib/agent/api/turn-deps";
import type { AgentFailureAlertRoute } from "@/lib/server/agent-failure-alerts";
import type { OrgSettings } from "@/types";
import type { RawToolCall } from "@shopkeeper/agent/types";

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
  return coreExecuteCurrentCachedHomePlan(params, buildDashboardTurnDeps());
}

export function maybeAutoExecuteCurrentCachedHomePlan(params: {
  orgId: string;
  threadId: string;
  settings: OrgSettings;
  failureRoute: AgentFailureAlertRoute;
}) {
  return coreMaybeAutoExecuteCurrentCachedHomePlan(params, buildDashboardTurnDeps());
}

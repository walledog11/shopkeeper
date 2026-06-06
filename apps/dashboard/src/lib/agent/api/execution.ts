// Host wrapper — core executeAgentTurn moved to @clerk/agent/turn (Track 4.1).
// The dashboard's injected seams live in ./turn-deps (shared with plan-execution).
import {
  executeAgentTurn as coreExecuteAgentTurn,
  type ExecuteAgentTurnParams as CoreExecuteAgentTurnParams,
} from "@clerk/agent/turn";
import type { AgentResult } from "@clerk/agent/context";
import type { LockProvider } from "@clerk/agent/lock";
import type { AgentFailureAlertRoute } from "@/lib/server/agent-failure-alerts";
import { buildDashboardTurnDeps } from "@/lib/agent/api/turn-deps";

export interface ExecuteAgentTurnParams extends Omit<CoreExecuteAgentTurnParams, "failureRoute"> {
  failureRoute?: AgentFailureAlertRoute;
  lock?: LockProvider;
}

export function executeAgentTurn(params: ExecuteAgentTurnParams): Promise<AgentResult> {
  const { lock, ...core } = params;
  const deps = buildDashboardTurnDeps();
  return coreExecuteAgentTurn(core, lock ? { ...deps, lock } : deps);
}

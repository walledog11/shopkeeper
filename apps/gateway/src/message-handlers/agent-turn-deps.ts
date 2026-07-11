import { buildContext } from '@shopkeeper/agent/build-context';
import { runAgent } from '@shopkeeper/agent/run';
import type { ExecuteAgentTurnDeps, ExecuteTurnRunAgent } from '@shopkeeper/agent/turn';
import type { PlanExecutionDeps, ShadowRecorder } from '@shopkeeper/agent/plan-execution';
import type { AgentContext } from '@shopkeeper/agent/context';
import { getGatewayLockProvider } from '../clients/agent-runtime.js';
import { captureAgentActionsCompleted } from '../product-analytics.js';
import { gatewayThreadSink } from './agent-thread-sink.js';

// Injected turn seams for the gateway worker — counterpart to the dashboard's
// buildDashboardTurnDeps. The shadow recorder is a no-op because the
// AutonomyShadowDecision rig is dashboard-only, so worker auto-execute only
// runs live plans.
//
// runAgent is the core directly — the gateway has no ops-alert counter, so it
// omits recordToolFailure; tool failures still surface as AgentAction error rows
// and via the "[agent] tool error"/"[agent] tool result" logs. Whole-turn throws
// are logged by the Telegram route handlers ("[Telegram] Operator agent turn
// failed ..."), which catch and reply rather than failing the job.

const gatewayRunAgent: ExecuteTurnRunAgent = (ctx, instruction, approvedToolCalls, settings, options) =>
  runAgent(ctx, instruction, approvedToolCalls, settings, {
    turnId: options.turnId,
    mode: options.mode,
    approval: options.approval,
    onActionsPersisted: captureAgentActionsCompleted,
    ...(options.moduleTools ? { moduleTools: options.moduleTools } : {}),
  });

const noopShadow: ShadowRecorder = {
  recordShadowDecision: async () => {},
  resolveShadowDecisionOnApproval: async () => {},
};

export function buildGatewayTurnDeps(): ExecuteAgentTurnDeps {
  return {
    lock: getGatewayLockProvider(),
    buildContext: (
      threadId: string,
      orgId: string,
      mode,
      operatorLedger,
    ): Promise<AgentContext> =>
      buildContext(
        threadId,
        orgId,
        gatewayThreadSink,
        mode || operatorLedger
          ? { ...(mode ? { agentActionMode: mode } : {}), ...(operatorLedger ? { operatorLedger } : {}) }
          : undefined,
      ),
    runAgent: gatewayRunAgent,
  };
}

export function buildGatewayPlanExecutionDeps(): PlanExecutionDeps {
  return {
    ...buildGatewayTurnDeps(),
    shadow: noopShadow,
  };
}

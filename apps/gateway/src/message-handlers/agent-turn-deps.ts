import { buildContext } from '@shopkeeper/agent/build-context';
import { runAgent } from '@shopkeeper/agent/run';
import type { ExecuteAgentTurnDeps, ExecuteTurnRunAgent } from '@shopkeeper/agent/turn';
import type { PlanExecutionDeps, ShadowRecorder } from '@shopkeeper/agent/plan-execution';
import type { AgentContext } from '@shopkeeper/agent/context';
import { getGatewayLockProvider } from '../clients/agent-runtime.js';
import { gatewayThreadSink } from './agent-thread-sink.js';

// The worker's injected turn seams (Track 4.2), the gateway counterpart to the
// dashboard's buildDashboardTurnDeps. The shadow recorder is a no-op: the
// AutonomyShadowDecision rig is a dashboard-rollout-only system (trim list), so
// auto-execute in the worker only ever runs "live" plans (mode === "live").
//
// runAgent is the core directly — the gateway has no ops-alert counter, so it
// omits recordToolFailure; tool failures still surface as AgentAction error rows
// and via the worker's BullMQ job-failure logging.

const gatewayRunAgent: ExecuteTurnRunAgent = (ctx, instruction, approvedToolCalls, settings, options) =>
  runAgent(ctx, instruction, approvedToolCalls, settings, {
    turnId: options.turnId,
    mode: options.mode,
    approval: options.approval,
  });

const noopShadow: ShadowRecorder = {
  recordShadowDecision: async () => {},
  resolveShadowDecisionOnApproval: async () => {},
};

export function buildGatewayTurnDeps(): ExecuteAgentTurnDeps {
  return {
    lock: getGatewayLockProvider(),
    buildContext: (threadId: string, orgId: string): Promise<AgentContext> =>
      buildContext(threadId, orgId, gatewayThreadSink),
    runAgent: gatewayRunAgent,
  };
}

export function buildGatewayPlanExecutionDeps(): PlanExecutionDeps {
  return {
    ...buildGatewayTurnDeps(),
    shadow: noopShadow,
  };
}

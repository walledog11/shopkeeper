import { buildContext } from '@shopkeeper/agent/build-context';
import { planAgent } from '@shopkeeper/agent/planner';
import { runAgent } from '@shopkeeper/agent/run';
import type { ExecuteAgentTurnDeps, ExecuteTurnRunAgent } from '@shopkeeper/agent/turn';
import type { PlanExecutionDeps } from '@shopkeeper/agent/plan-execution';
import type { AgentContext, TaskModelBudget } from '@shopkeeper/agent/context';
import { getGatewayLockProvider } from '../../clients/agent-runtime.js';
import { captureAgentActionsCompleted } from '../../product-analytics.js';
import { gatewayThreadSink } from '../support-plan/agent-thread-sink.js';

// Injected turn seams for the gateway worker — counterpart to the dashboard's
// buildDashboardTurnDeps.
//
// runAgent is the core directly — the gateway has no ops-alert counter, so it
// omits recordToolFailure; tool failures still surface as AgentAction error rows
// and via the "[agent] tool error"/"[agent] tool result" logs. Whole-turn throws
// are logged by the Telegram route handlers ("[Telegram] Operator agent turn
// failed ..."), which catch and reply rather than failing the job.
//
// Every turn option reaches the core as given. Copying them one by one is how
// the merchant's answer to a card's blank was dropped on its way to the reply
// (2026-11-03): the refund ran and the reply was withheld for its empty blank.
const gatewayRunAgent: ExecuteTurnRunAgent = (ctx, instruction, approvedToolCalls, settings, options) =>
  runAgent(ctx, instruction, approvedToolCalls, settings, {
    ...options,
    onActionsPersisted: captureAgentActionsCompleted,
  });

export function buildGatewayTurnDeps(): ExecuteAgentTurnDeps {
  return {
    lock: getGatewayLockProvider(),
    buildContext: (
      threadId: string,
      orgId: string,
      mode,
      operatorLedger,
      operatorDeskMode,
    ): Promise<AgentContext> =>
      buildContext(
        threadId,
        orgId,
        gatewayThreadSink,
        mode || operatorLedger || operatorDeskMode
          ? {
              ...(mode ? { agentActionMode: mode } : {}),
              ...(operatorLedger ? { operatorLedger } : {}),
              ...(operatorDeskMode ? { operatorDeskMode } : {}),
            }
          : undefined,
      ),
    runAgent: gatewayRunAgent,
  };
}

export function buildGatewayPlanExecutionDeps(taskBudget?: TaskModelBudget): PlanExecutionDeps {
  const turnDeps = buildGatewayTurnDeps();
  return {
    ...turnDeps,
    ...(taskBudget ? {
      buildContext: async (...args: Parameters<typeof turnDeps.buildContext>) => {
        const context = await turnDeps.buildContext(...args);
        context.taskBudget = taskBudget;
        return context;
      },
    } : {}),
    planAgent,
  };
}

// The dashboard's injected turn seams (Track 4.1), shared by the executeAgentTurn
// and plan-execution host wrappers so direct runs and auto-execute go through
// identical infra: Upstash lock, the thread-io-sink context builder, and the
// ops-alert runAgent wrapper (fed the Redis-built failure-counter client exactly
// as the pre-move code did).
//
// Built lazily (a function, not a module-scope literal) so importing this module
// never reads the runner bindings — keeps tests that partially mock the runner
// or only exercise unrelated exports from tripping over an eager access.
import { buildContext, runAgent } from "@/lib/agent/runner";
import { upstashLockProvider } from "@/lib/server/agent-lock";
import { getRedis } from "@/lib/server/redis";
import type { ExecuteAgentTurnDeps, ExecuteTurnRunAgent } from "@clerk/agent/turn";
import type { OpsAlertCounterClient } from "@/lib/server/ops-alerts";
import type { AgentFailureAlertRoute } from "@/lib/server/agent-failure-alerts";

const runWithFailureCounter: ExecuteTurnRunAgent = (ctx, instruction, approvedToolCalls, settings, options) => {
  let failureCounterClient: OpsAlertCounterClient | undefined;
  if (options.failureRoute) {
    try {
      failureCounterClient = getRedis();
    } catch {
      failureCounterClient = undefined;
    }
  }
  return runAgent(ctx, instruction, approvedToolCalls, settings, {
    ...options,
    failureRoute: options.failureRoute as AgentFailureAlertRoute | undefined,
    ...(failureCounterClient ? { failureCounterClient } : {}),
  });
};

export function buildDashboardTurnDeps(): ExecuteAgentTurnDeps {
  return {
    lock: upstashLockProvider,
    buildContext,
    runAgent: runWithFailureCounter,
  };
}

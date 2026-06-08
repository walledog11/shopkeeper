// Host wrapper — core runAgent moved to @shopkeeper/agent (Track 2 extraction).
// The dashboard injects its ops-alert failure recorder (counter window)
// so the shared package stays free of alerting infra (env, ops-alerts).
import { runAgent as coreRunAgent, type RunAgentOptions as CoreRunAgentOptions } from "@shopkeeper/agent/run";
import type { BaseAgentContext, AgentResult } from "@shopkeeper/agent/context";
import type { OrgSettings, RawToolCall } from "@/types";
import { recordAgentFailure, type AgentFailureAlertRoute } from "@/lib/server/agent-failure-alerts";
import type { OpsAlertCounterClient } from "@/lib/server/ops-alerts";

export interface RunAgentOptions extends Omit<CoreRunAgentOptions, "recordToolFailure"> {
  failureRoute?: AgentFailureAlertRoute;
  failureCounterClient?: OpsAlertCounterClient;
}

export function runAgent(
  ctx: BaseAgentContext,
  instruction: string,
  approvedToolCalls?: RawToolCall[],
  settings?: OrgSettings,
  options?: RunAgentOptions,
): Promise<AgentResult> {
  const { failureRoute = "unknown", failureCounterClient, ...rest } = options ?? {};
  return coreRunAgent(ctx, instruction, approvedToolCalls, settings, {
    ...rest,
    recordToolFailure: failureCounterClient
      ? (kind, tool, detail) =>
          recordAgentFailure(
            { kind, route: failureRoute, orgId: ctx.orgId, tool, detail },
            { counterClient: failureCounterClient },
          )
      : undefined,
  });
}

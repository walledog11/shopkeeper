import { getGatewayOpsAlertConfig, type GatewayOpsAlertConfig } from './config/runtime-config.js';
import { getOpsAlertCounterClient } from './ops-alert-counter.js';
import {
  recordAgentFailureAlert,
  shouldSkipOpsAlertInTest,
  type AgentFailureRouteSet,
  type OpsAlertBackgroundOptions,
  type OpsAlertCounterClient,
  type OpsAlertRecordResult,
  type RecordAgentFailureInput,
} from '@shopkeeper/agent/observability';
import { emitOpsAlert, incrementOpsAlertWindow } from './ops-alerts.js';

const GATEWAY_AGENT_FAILURE_ROUTES = [
  'gateway-thread-sink',
] as const;

export type GatewayAgentFailureRoute = typeof GATEWAY_AGENT_FAILURE_ROUTES[number];
export type AgentFailureKind = 'tool_result' | 'tool_exception';

// An unrecognised route records as the thread sink rather than as "unknown":
// it is the only agent path the gateway has, so a name it does not recognise is
// a renamed sink, not a different caller.
const ROUTES: AgentFailureRouteSet = {
  allowed: GATEWAY_AGENT_FAILURE_ROUTES,
  fallback: 'gateway-thread-sink',
};

export interface AgentFailureAlertInput extends RecordAgentFailureInput {
  kind: AgentFailureKind;
}

export interface AgentFailureAlertDependencies {
  counterClient: OpsAlertCounterClient;
  config?: GatewayOpsAlertConfig;
  emitAlert?: typeof emitOpsAlert;
  incrementWindow?: typeof incrementOpsAlertWindow;
  nowMs?: number;
}

export type AgentFailureAlertResult = OpsAlertRecordResult;
export type AgentFailureBackgroundOptions = OpsAlertBackgroundOptions;

export async function recordAgentFailure(
  input: AgentFailureAlertInput,
  deps: AgentFailureAlertDependencies,
): Promise<AgentFailureAlertResult> {
  return recordAgentFailureAlert(input, {
    counterClient: deps.counterClient,
    config: deps.config ?? getGatewayOpsAlertConfig(),
    service: 'gateway',
    routes: ROUTES,
    emitAlert: deps.emitAlert ?? emitOpsAlert,
    ...(deps.incrementWindow ? { incrementWindow: deps.incrementWindow } : {}),
    ...(deps.nowMs !== undefined ? { nowMs: deps.nowMs } : {}),
  });
}

export function recordAgentFailureInBackground(
  input: AgentFailureAlertInput,
  options: AgentFailureBackgroundOptions = {},
): void {
  if (shouldSkipOpsAlertInTest(options)) return;

  let counterClient: OpsAlertCounterClient;
  try {
    counterClient = options.getCounterClient?.() ?? getOpsAlertCounterClient();
  } catch (error) {
    options.onError?.(error);
    return;
  }

  void recordAgentFailure(input, { counterClient }).catch((error) => {
    options.onError?.(error);
  });
}

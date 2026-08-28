import { getDashboardOpsAlertConfig, type DashboardOpsAlertConfig } from '@/lib/env';
import {
  recordAgentFailureAlert,
  shouldSkipOpsAlertInTest,
  type AgentFailureRouteSet,
  type OpsAlertBackgroundOptions,
  type OpsAlertCounterClient,
  type OpsAlertRecordResult,
  type RecordAgentFailureInput,
} from '@shopkeeper/agent/observability';
import { emitOpsAlert, incrementOpsAlertWindow } from '@/lib/server/ops-alerts';

export const AGENT_FAILURE_ROUTES = [
  '/api/agent',
  '/api/agent/chat',
  '/api/agent/quick-approve',
  '/api/agent/pending',
  'unknown',
] as const;

export type AgentFailureAlertRoute = typeof AGENT_FAILURE_ROUTES[number];
export type AgentFailureKind = 'route_failure' | 'tool_result' | 'tool_exception';

const ROUTES: AgentFailureRouteSet = { allowed: AGENT_FAILURE_ROUTES, fallback: 'unknown' };

export type AgentFailureAlertInput = RecordAgentFailureInput;

export interface AgentFailureAlertDependencies {
  counterClient: OpsAlertCounterClient;
  config?: DashboardOpsAlertConfig;
  emitAlert?: typeof emitOpsAlert;
  incrementWindow?: typeof incrementOpsAlertWindow;
  nowMs?: number;
}

export type AgentFailureAlertResult = OpsAlertRecordResult;

// The dashboard requires an explicit counter-client factory: unlike the gateway
// there is no module-level singleton to fall back to.
export interface AgentFailureBackgroundOptions extends OpsAlertBackgroundOptions {
  getCounterClient: () => OpsAlertCounterClient;
}

export interface AgentRouteFailureInput {
  route: AgentFailureAlertRoute;
  orgId?: string | null;
  tool?: string | null;
  error?: unknown;
  statusCode?: number | null;
  detail?: string | null;
}

export async function recordAgentFailure(
  input: AgentFailureAlertInput,
  deps: AgentFailureAlertDependencies,
): Promise<AgentFailureAlertResult> {
  return recordAgentFailureAlert(input, {
    counterClient: deps.counterClient,
    config: deps.config ?? getDashboardOpsAlertConfig(),
    service: 'dashboard',
    routes: ROUTES,
    emitAlert: deps.emitAlert ?? emitOpsAlert,
    ...(deps.incrementWindow ? { incrementWindow: deps.incrementWindow } : {}),
    ...(deps.nowMs !== undefined ? { nowMs: deps.nowMs } : {}),
  });
}

export async function recordAgentRouteFailure(
  input: AgentRouteFailureInput,
  options: AgentFailureBackgroundOptions,
): Promise<AgentFailureAlertResult | null> {
  if (shouldSkipOpsAlertInTest(options)) return null;

  let counterClient: OpsAlertCounterClient;
  try {
    counterClient = options.getCounterClient();
  } catch (error) {
    options.onError?.(error);
    return null;
  }

  try {
    return await recordAgentFailure({
      kind: 'route_failure',
      route: input.route,
      orgId: input.orgId,
      tool: input.tool ?? null,
      statusCode: input.statusCode ?? readStatusCode(input.error),
      detail: input.detail ?? readErrorDetail(input.error),
    }, { counterClient });
  } catch (error) {
    options.onError?.(error);
    return null;
  }
}

export function recordAgentFailureInBackground(
  input: AgentFailureAlertInput,
  options: AgentFailureBackgroundOptions,
): void {
  if (shouldSkipOpsAlertInTest(options)) return;

  let counterClient: OpsAlertCounterClient;
  try {
    counterClient = options.getCounterClient();
  } catch (error) {
    options.onError?.(error);
    return;
  }

  void recordAgentFailure(input, { counterClient }).catch((error) => {
    options.onError?.(error);
  });
}

export function recordAgentRouteFailureInBackground(
  input: AgentRouteFailureInput,
  options: AgentFailureBackgroundOptions,
): void {
  void recordAgentRouteFailure(input, options).catch((error) => {
    options.onError?.(error);
  });
}

function readStatusCode(error: unknown): number {
  if (typeof error === 'object' && error !== null) {
    const status = (error as { status?: unknown }).status;
    if (typeof status === 'number' && Number.isFinite(status)) {
      return status;
    }
  }

  return 500;
}

function readErrorDetail(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (error === null || error === undefined) {
    return 'Unknown error';
  }
  return String(error);
}

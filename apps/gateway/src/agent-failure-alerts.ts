import { getGatewayOpsAlertConfig, type GatewayOpsAlertConfig } from './config/runtime-config.js';
import { getOpsAlertCounterClient } from './ops-alert-counter.js';
import {
  emitOpsAlert,
  incrementOpsAlertWindow,
  type IncrementOpsAlertWindowResult,
  type OpsAlertCounterClient,
} from './ops-alerts.js';

export const GATEWAY_AGENT_FAILURE_ROUTES = [
  'gateway-thread-sink',
] as const;

export type GatewayAgentFailureRoute = typeof GATEWAY_AGENT_FAILURE_ROUTES[number];
export type AgentFailureKind = 'tool_result' | 'tool_exception';

export interface AgentFailureAlertInput {
  kind: AgentFailureKind;
  route?: string | null;
  orgId?: string | null;
  tool?: string | null;
  statusCode?: number | null;
  detail?: string | null;
}

export interface AgentFailureAlertDependencies {
  counterClient: OpsAlertCounterClient;
  config?: GatewayOpsAlertConfig;
  emitAlert?: typeof emitOpsAlert;
  incrementWindow?: typeof incrementOpsAlertWindow;
  nowMs?: number;
}

export interface AgentFailureAlertResult {
  window: IncrementOpsAlertWindowResult;
  emitted: boolean;
}

export interface AgentFailureBackgroundOptions {
  getCounterClient?: () => OpsAlertCounterClient;
  onError?: (error: unknown) => void;
  skipInTest?: boolean;
}

const VALID_ROUTES = new Set<string>(GATEWAY_AGENT_FAILURE_ROUTES);
const UNKNOWN_VALUE = 'unknown';

export async function recordAgentFailure(
  input: AgentFailureAlertInput,
  deps: AgentFailureAlertDependencies,
): Promise<AgentFailureAlertResult> {
  const config = deps.config ?? getGatewayOpsAlertConfig();
  const emit = deps.emitAlert ?? emitOpsAlert;
  const incr = deps.incrementWindow ?? incrementOpsAlertWindow;

  const route = normalizeRoute(input.route);
  const orgId = normalizeValue(input.orgId);
  const tool = normalizeValue(input.tool);

  const window = await incr(deps.counterClient, {
    keyParts: ['agent_failure', input.kind, route, orgId, tool],
    threshold: config.agentFailureThreshold,
    windowSecs: config.windowSecs,
    nowMs: deps.nowMs,
  });

  if (window.thresholdCrossed) {
    emit({
      category: 'agent_failure',
      message: formatFailureMessage(input.kind, route, tool, window.count),
      level: 'error',
      tags: {
        route,
        tool,
      },
      fingerprint: [
        'ops-alert',
        'agent_failure',
        'gateway',
        `kind:${input.kind}`,
        `route:${route}`,
        `tool:${tool}`,
      ],
      extra: {
        kind: input.kind,
        route,
        orgId,
        tool,
        statusCode: input.statusCode ?? null,
        detail: input.detail ?? null,
        count: window.count,
        threshold: window.threshold,
        windowSecs: config.windowSecs,
        resetAt: window.resetAt,
      },
    }, { config });
  }

  return { window, emitted: window.thresholdCrossed };
}

export function recordAgentFailureInBackground(
  input: AgentFailureAlertInput,
  options: AgentFailureBackgroundOptions = {},
): void {
  if (shouldSkipInTest(options)) {
    return;
  }

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

function shouldSkipInTest(options: AgentFailureBackgroundOptions): boolean {
  if (options.skipInTest === false) {
    return false;
  }

  return process.env.NODE_ENV === 'test' || process.env.E2E_TEST_RUN === 'true';
}

function normalizeRoute(route: string | null | undefined): GatewayAgentFailureRoute {
  const value = normalizeValue(route);
  return VALID_ROUTES.has(value) ? value as GatewayAgentFailureRoute : 'gateway-thread-sink';
}

function normalizeValue(value: string | null | undefined): string {
  if (typeof value !== 'string') {
    return UNKNOWN_VALUE;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : UNKNOWN_VALUE;
}

function formatFailureMessage(kind: AgentFailureKind, route: GatewayAgentFailureRoute, tool: string, count: number): string {
  if (kind === 'tool_exception') {
    return `Repeated agent tool exception: route=${route} tool=${tool} count=${count}`;
  }
  return `Repeated agent tool error result: route=${route} tool=${tool} count=${count}`;
}

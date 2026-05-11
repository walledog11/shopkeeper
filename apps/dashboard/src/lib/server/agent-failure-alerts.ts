import { getDashboardOpsAlertConfig, type DashboardOpsAlertConfig } from '@/lib/env';
import {
  emitOpsAlert,
  flushOpsAlertDelivery,
  incrementOpsAlertWindow,
  type EmitOpsAlertDependencies,
  type IncrementOpsAlertWindowResult,
  type OpsAlertCounterClient,
} from '@/lib/server/ops-alerts';

export const AGENT_FAILURE_ROUTES = [
  '/api/agent',
  '/api/agent/internal',
  '/api/agent/chat',
  '/api/agent/quick-approve',
  'unknown',
] as const;

export type AgentFailureAlertRoute = typeof AGENT_FAILURE_ROUTES[number];
export type AgentFailureKind = 'route_failure' | 'tool_result' | 'tool_exception';

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
  config?: DashboardOpsAlertConfig;
  emitAlert?: typeof emitOpsAlert;
  flushAlertDelivery?: (dependencies?: EmitOpsAlertDependencies) => Promise<boolean>;
  incrementWindow?: typeof incrementOpsAlertWindow;
  nowMs?: number;
}

export interface AgentFailureAlertResult {
  window: IncrementOpsAlertWindowResult;
  emitted: boolean;
}

export interface AgentFailureBackgroundOptions {
  getCounterClient: () => OpsAlertCounterClient;
  onError?: (error: unknown) => void;
  skipInTest?: boolean;
}

export interface AgentRouteFailureInput {
  route: AgentFailureAlertRoute;
  orgId?: string | null;
  tool?: string | null;
  error?: unknown;
  statusCode?: number | null;
  detail?: string | null;
}

const VALID_ROUTES = new Set<string>(AGENT_FAILURE_ROUTES);
const UNKNOWN_VALUE = 'unknown';

export async function recordAgentFailure(
  input: AgentFailureAlertInput,
  deps: AgentFailureAlertDependencies,
): Promise<AgentFailureAlertResult> {
  const config = deps.config ?? getDashboardOpsAlertConfig();
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
    const alert = emit({
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
        'dashboard',
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

    if (alert.captured) {
      await (deps.flushAlertDelivery ?? flushOpsAlertDelivery)({ config });
    }
  }

  return { window, emitted: window.thresholdCrossed };
}

export async function recordAgentRouteFailure(
  input: AgentRouteFailureInput,
  options: AgentFailureBackgroundOptions,
): Promise<AgentFailureAlertResult | null> {
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
  if ((options.skipInTest ?? true) && process.env.NODE_ENV === 'test') {
    return;
  }

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

function normalizeRoute(route: string | null | undefined): AgentFailureAlertRoute {
  const value = normalizeValue(route);
  return VALID_ROUTES.has(value) ? value as AgentFailureAlertRoute : 'unknown';
}

function normalizeValue(value: string | null | undefined): string {
  if (typeof value !== 'string') {
    return UNKNOWN_VALUE;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : UNKNOWN_VALUE;
}

function formatFailureMessage(kind: AgentFailureKind, route: AgentFailureAlertRoute, tool: string, count: number): string {
  if (kind === 'route_failure') {
    return `Repeated agent route failure: route=${route} count=${count}`;
  }
  if (kind === 'tool_exception') {
    return `Repeated agent tool exception: route=${route} tool=${tool} count=${count}`;
  }
  return `Repeated agent tool error result: route=${route} tool=${tool} count=${count}`;
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

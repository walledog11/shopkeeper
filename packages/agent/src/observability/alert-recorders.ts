import {
  incrementOpsAlertWindow,
  type EmitOpsAlertResult,
  type IncrementOpsAlertWindowResult,
  type OpsAlertConfig,
  type OpsAlertCounterClient,
  type OpsAlertInput,
  type OpsAlertService,
} from './ops-alerts.js';

/**
 * Threshold recorders built on the ops-alert engine: count a failure in a fixed
 * window, raise one alert the moment the threshold is crossed.
 *
 * These lived in both hosts as near-verbatim copies. They differ only in the
 * config source, the service tag, and which route/provider names are known — all
 * data, all injected. The copies had already drifted (one passed its config
 * through to `emitOpsAlert`, the other did not, so an injected config silently
 * skipped the emit gate on one host and not the other), which is the argument
 * for having one of each rather than two.
 *
 * The host shims (`apps/gateway/src/{agent,provider-send}-failure-alerts.ts`,
 * `apps/dashboard/src/lib/server/…`) bind the config and the background/
 * fire-and-forget wrappers; everything below is host-agnostic.
 */

/** The host `emitOpsAlert` shim, as the recorders call it. */
export type HostEmitOpsAlert<TConfig extends OpsAlertConfig> = (
  input: OpsAlertInput,
  deps?: { config?: TConfig },
) => EmitOpsAlertResult;

export interface OpsAlertRecordResult {
  window: IncrementOpsAlertWindowResult;
  emitted: boolean;
}

export interface OpsAlertBackgroundOptions {
  getCounterClient?: () => OpsAlertCounterClient;
  onError?: (error: unknown) => void;
  skipInTest?: boolean;
}

const UNKNOWN_VALUE = 'unknown';

/** Blank, absent, and non-string all collapse to one counter bucket. */
export function normalizeOpsAlertValue(value: string | null | undefined): string {
  if (typeof value !== 'string') return UNKNOWN_VALUE;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : UNKNOWN_VALUE;
}

/**
 * Background recorders no-op under test by default: they reach for a live Redis
 * counter, which no unit suite provides. `skipInTest: false` opts a test back in.
 */
export function shouldSkipOpsAlertInTest(options: OpsAlertBackgroundOptions): boolean {
  if (options.skipInTest === false) return false;
  return process.env.NODE_ENV === 'test' || process.env.E2E_TEST_RUN === 'true';
}

// ---------------------------------------------------------------- agent failure

export type AgentFailureKind = 'route_failure' | 'tool_result' | 'tool_exception';

export interface AgentFailureAlertConfig extends OpsAlertConfig {
  agentFailureThreshold: number;
  windowSecs: number;
}

/** Known route names, and what an unrecognised one is recorded as. */
export interface AgentFailureRouteSet {
  allowed: readonly string[];
  fallback: string;
}

export interface RecordAgentFailureInput {
  kind: AgentFailureKind;
  route?: string | null;
  orgId?: string | null;
  tool?: string | null;
  statusCode?: number | null;
  detail?: string | null;
}

export interface RecordAgentFailureDeps<TConfig extends AgentFailureAlertConfig> {
  counterClient: OpsAlertCounterClient;
  config: TConfig;
  service: OpsAlertService;
  routes: AgentFailureRouteSet;
  emitAlert: HostEmitOpsAlert<TConfig>;
  incrementWindow?: typeof incrementOpsAlertWindow;
  nowMs?: number;
}

export async function recordAgentFailureAlert<TConfig extends AgentFailureAlertConfig>(
  input: RecordAgentFailureInput,
  deps: RecordAgentFailureDeps<TConfig>,
): Promise<OpsAlertRecordResult> {
  const { config, service, routes } = deps;
  const incr = deps.incrementWindow ?? incrementOpsAlertWindow;

  const route = normalizeAgainst(input.route, routes);
  const orgId = normalizeOpsAlertValue(input.orgId);
  const tool = normalizeOpsAlertValue(input.tool);

  const window = await incr(deps.counterClient, {
    keyParts: ['agent_failure', input.kind, route, orgId, tool],
    threshold: config.agentFailureThreshold,
    windowSecs: config.windowSecs,
    nowMs: deps.nowMs,
  });

  if (window.thresholdCrossed) {
    deps.emitAlert({
      category: 'agent_failure',
      message: formatAgentFailureMessage(input.kind, route, tool, window.count),
      level: 'error',
      tags: { route, tool },
      fingerprint: [
        'ops-alert',
        'agent_failure',
        service,
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

function normalizeAgainst(route: string | null | undefined, routes: AgentFailureRouteSet): string {
  const value = normalizeOpsAlertValue(route);
  return routes.allowed.includes(value) ? value : routes.fallback;
}

function formatAgentFailureMessage(
  kind: AgentFailureKind,
  route: string,
  tool: string,
  count: number,
): string {
  if (kind === 'route_failure') {
    return `Repeated agent route failure: route=${route} count=${count}`;
  }
  if (kind === 'tool_exception') {
    return `Repeated agent tool exception: route=${route} tool=${tool} count=${count}`;
  }
  return `Repeated agent tool error result: route=${route} tool=${tool} count=${count}`;
}

// ----------------------------------------------------------------- provider send

export interface ProviderSendAlertConfig extends OpsAlertConfig {
  providerSendThreshold: number;
  windowSecs: number;
}

export interface RecordProviderSendFailureInput {
  provider: string;
  channel: string;
  orgId?: string | null;
  threadId?: string | null;
  integrationId?: string | null;
  detail?: string | null;
  extra?: Record<string, unknown>;
}

export interface RecordProviderSendFailureDeps<TConfig extends ProviderSendAlertConfig> {
  counterClient: OpsAlertCounterClient;
  config: TConfig;
  emitAlert: HostEmitOpsAlert<TConfig>;
  incrementWindow?: typeof incrementOpsAlertWindow;
  nowMs?: number;
}

export async function recordProviderSendFailureAlert<TConfig extends ProviderSendAlertConfig>(
  input: RecordProviderSendFailureInput,
  deps: RecordProviderSendFailureDeps<TConfig>,
): Promise<OpsAlertRecordResult> {
  const { config } = deps;
  const incr = deps.incrementWindow ?? incrementOpsAlertWindow;

  const { provider, channel } = input;
  const orgId = normalizeOpsAlertValue(input.orgId);

  const window = await incr(deps.counterClient, {
    keyParts: ['provider_send', provider, channel, orgId],
    threshold: config.providerSendThreshold,
    windowSecs: config.windowSecs,
    nowMs: deps.nowMs,
  });

  if (window.thresholdCrossed) {
    deps.emitAlert({
      category: 'provider_send',
      message: `Repeated provider send failure: provider=${provider} channel=${channel} count=${window.count}`,
      level: 'error',
      tags: { provider, channel },
      extra: {
        orgId,
        threadId: input.threadId ?? null,
        integrationId: input.integrationId ?? null,
        detail: input.detail ?? null,
        count: window.count,
        threshold: window.threshold,
        windowSecs: config.windowSecs,
        resetAt: window.resetAt,
        ...(input.extra ?? {}),
      },
    }, { config });
  }

  return { window, emitted: window.thresholdCrossed };
}

import { getGatewayOpsAlertConfig, type GatewayOpsAlertConfig } from './config/runtime-config.js';
import { getOpsAlertCounterClient } from './ops-alert-counter.js';
import {
  emitOpsAlert,
  incrementOpsAlertWindow,
  type IncrementOpsAlertWindowResult,
  type OpsAlertCounterClient,
} from './ops-alerts.js';

export type ProviderSendAlertProvider = 'telegram';
export type ProviderSendAlertChannel = 'operator_notify';

export interface ProviderSendAlertDependencies {
  counterClient: OpsAlertCounterClient;
  config?: GatewayOpsAlertConfig;
  emitAlert?: typeof emitOpsAlert;
  incrementWindow?: typeof incrementOpsAlertWindow;
  nowMs?: number;
  threadId?: string | null;
  detail?: string | null;
  extra?: Record<string, unknown>;
}

export interface ProviderSendAlertResult {
  window: IncrementOpsAlertWindowResult;
  emitted: boolean;
}

export interface ProviderSendBackgroundOptions {
  getCounterClient?: () => OpsAlertCounterClient;
  onError?: (error: unknown) => void;
  skipInTest?: boolean;
}

const UNKNOWN_ORG = 'unknown';

export async function recordProviderSendFailure(
  provider: ProviderSendAlertProvider,
  channel: ProviderSendAlertChannel,
  orgId: string | null | undefined,
  deps: ProviderSendAlertDependencies,
): Promise<ProviderSendAlertResult> {
  const config = deps.config ?? getGatewayOpsAlertConfig();
  const emit = deps.emitAlert ?? emitOpsAlert;
  const incr = deps.incrementWindow ?? incrementOpsAlertWindow;
  const normalizedOrgId = normalizeOrgId(orgId);

  const window = await incr(deps.counterClient, {
    keyParts: ['provider_send', provider, channel, normalizedOrgId],
    threshold: config.providerSendThreshold,
    windowSecs: config.windowSecs,
    nowMs: deps.nowMs,
  });

  if (window.thresholdCrossed) {
    emit({
      category: 'provider_send',
      message: `Repeated provider send failure: provider=${provider} channel=${channel} count=${window.count}`,
      level: 'error',
      tags: { provider, channel },
      extra: {
        orgId: normalizedOrgId,
        threadId: deps.threadId ?? null,
        detail: deps.detail ?? null,
        count: window.count,
        threshold: window.threshold,
        windowSecs: config.windowSecs,
        resetAt: window.resetAt,
        ...(deps.extra ?? {}),
      },
    }, { config });
  }

  return { window, emitted: window.thresholdCrossed };
}

export function recordProviderSendFailureInBackground(
  provider: ProviderSendAlertProvider,
  channel: ProviderSendAlertChannel,
  orgId: string | null | undefined,
  input: Omit<ProviderSendAlertDependencies, 'counterClient'>,
  options: ProviderSendBackgroundOptions = {},
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

  void recordProviderSendFailure(provider, channel, orgId, {
    ...input,
    counterClient,
  }).catch((error) => {
    options.onError?.(error);
  });
}

function shouldSkipInTest(options: ProviderSendBackgroundOptions): boolean {
  if (options.skipInTest === false) {
    return false;
  }

  return process.env.NODE_ENV === 'test' || process.env.E2E_TEST_RUN === 'true';
}

function normalizeOrgId(orgId: string | null | undefined): string {
  if (typeof orgId !== 'string') {
    return UNKNOWN_ORG;
  }

  const trimmed = orgId.trim();
  return trimmed.length > 0 ? trimmed : UNKNOWN_ORG;
}

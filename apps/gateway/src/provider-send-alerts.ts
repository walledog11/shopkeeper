import { getGatewayOpsAlertConfig, type GatewayOpsAlertConfig } from './config/runtime-config.js';
import { getOpsAlertCounterClient } from './ops-alert-counter.js';
import {
  recordProviderSendFailureAlert,
  shouldSkipOpsAlertInTest,
  type OpsAlertBackgroundOptions,
  type OpsAlertCounterClient,
  type OpsAlertRecordResult,
} from '@shopkeeper/agent/observability';
import { emitOpsAlert, incrementOpsAlertWindow } from './ops-alerts.js';

export type ProviderSendAlertProvider = 'telegram' | 'imessage';
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

export type ProviderSendAlertResult = OpsAlertRecordResult;
export type ProviderSendBackgroundOptions = OpsAlertBackgroundOptions;

export async function recordProviderSendFailure(
  provider: ProviderSendAlertProvider,
  channel: ProviderSendAlertChannel,
  orgId: string | null | undefined,
  deps: ProviderSendAlertDependencies,
): Promise<ProviderSendAlertResult> {
  return recordProviderSendFailureAlert({
    provider,
    channel,
    orgId,
    threadId: deps.threadId,
    detail: deps.detail,
    ...(deps.extra ? { extra: deps.extra } : {}),
  }, {
    counterClient: deps.counterClient,
    config: deps.config ?? getGatewayOpsAlertConfig(),
    emitAlert: deps.emitAlert ?? emitOpsAlert,
    ...(deps.incrementWindow ? { incrementWindow: deps.incrementWindow } : {}),
    ...(deps.nowMs !== undefined ? { nowMs: deps.nowMs } : {}),
  });
}

export function recordProviderSendFailureInBackground(
  provider: ProviderSendAlertProvider,
  channel: ProviderSendAlertChannel,
  orgId: string | null | undefined,
  input: Omit<ProviderSendAlertDependencies, 'counterClient'>,
  options: ProviderSendBackgroundOptions = {},
): void {
  if (shouldSkipOpsAlertInTest(options)) return;

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

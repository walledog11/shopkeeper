import {
  recordProviderSendFailureAlert,
  type OpsAlertCounterClient,
  type OpsAlertRecordResult,
} from '@shopkeeper/agent/observability';
import { emitOpsAlert, incrementOpsAlertWindow } from '@/lib/server/ops-alerts';
import { getDashboardOpsAlertConfig, type DashboardOpsAlertConfig } from '@/lib/env';

export type ProviderSendAlertProvider = 'meta' | 'postmark' | 'shopify' | 'gmail' | 'tiktok_shop';
export type ProviderSendAlertChannel = 'ig_dm' | 'email' | 'tiktok' | 'webhook_registration';

export interface ProviderSendAlertDependencies {
  counterClient: OpsAlertCounterClient;
  config?: DashboardOpsAlertConfig;
  emitAlert?: typeof emitOpsAlert;
  incrementWindow?: typeof incrementOpsAlertWindow;
  nowMs?: number;
  threadId?: string | null;
  integrationId?: string | null;
  detail?: string | null;
  extra?: Record<string, unknown>;
}

export type ProviderSendAlertResult = OpsAlertRecordResult;

export async function recordProviderSendFailure(
  provider: ProviderSendAlertProvider,
  channel: ProviderSendAlertChannel,
  orgId: string,
  deps: ProviderSendAlertDependencies,
): Promise<ProviderSendAlertResult> {
  return recordProviderSendFailureAlert({
    provider,
    channel,
    orgId,
    threadId: deps.threadId,
    integrationId: deps.integrationId,
    detail: deps.detail,
    ...(deps.extra ? { extra: deps.extra } : {}),
  }, {
    counterClient: deps.counterClient,
    config: deps.config ?? getDashboardOpsAlertConfig(),
    emitAlert: deps.emitAlert ?? emitOpsAlert,
    ...(deps.incrementWindow ? { incrementWindow: deps.incrementWindow } : {}),
    ...(deps.nowMs !== undefined ? { nowMs: deps.nowMs } : {}),
  });
}

import {
  emitOpsAlert,
  incrementOpsAlertWindow,
  type OpsAlertCounterClient,
  type IncrementOpsAlertWindowResult,
} from '@/lib/server/ops-alerts';
import { getDashboardOpsAlertConfig, type DashboardOpsAlertConfig } from '@/lib/env';

export type ProviderSendAlertProvider = 'meta' | 'postmark' | 'twilio' | 'shopify';
export type ProviderSendAlertChannel = 'ig_dm' | 'email' | 'sms' | 'webhook_registration';

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

export interface ProviderSendAlertResult {
  window: IncrementOpsAlertWindowResult;
  emitted: boolean;
}

export async function recordProviderSendFailure(
  provider: ProviderSendAlertProvider,
  channel: ProviderSendAlertChannel,
  orgId: string,
  deps: ProviderSendAlertDependencies,
): Promise<ProviderSendAlertResult> {
  const config = deps.config ?? getDashboardOpsAlertConfig();
  const emit = deps.emitAlert ?? emitOpsAlert;
  const incr = deps.incrementWindow ?? incrementOpsAlertWindow;

  const window = await incr(deps.counterClient, {
    keyParts: ['provider_send', provider, channel, orgId],
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
        orgId,
        threadId: deps.threadId ?? null,
        integrationId: deps.integrationId ?? null,
        detail: deps.detail ?? null,
        count: window.count,
        threshold: window.threshold,
        windowSecs: config.windowSecs,
        resetAt: window.resetAt,
        ...(deps.extra ?? {}),
      },
    });
  }

  return { window, emitted: window.thresholdCrossed };
}

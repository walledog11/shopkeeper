import {
  emitOpsAlert,
  incrementOpsAlertWindow,
  type OpsAlertCounterClient,
  type IncrementOpsAlertWindowResult,
} from '../ops-alerts.js';
import { getGatewayOpsAlertConfig, type GatewayOpsAlertConfig } from '../config/runtime-config.js';

export type WebhookSignatureProvider = 'meta' | 'shopify' | 'twilio';
export type WebhookSignatureFailureReason =
  | 'missing_signature'
  | 'missing_raw_body'
  | 'signature_mismatch'
  | 'validation_failed';

export interface WebhookSignatureAlertDependencies {
  counterClient: OpsAlertCounterClient;
  config?: GatewayOpsAlertConfig;
  emitAlert?: typeof emitOpsAlert;
  incrementWindow?: typeof incrementOpsAlertWindow;
  nowMs?: number;
}

export interface WebhookSignatureAlertResult {
  window: IncrementOpsAlertWindowResult;
  emitted: boolean;
}

export async function recordWebhookSignatureFailure(
  provider: WebhookSignatureProvider,
  reason: WebhookSignatureFailureReason,
  deps: WebhookSignatureAlertDependencies,
): Promise<WebhookSignatureAlertResult> {
  const config = deps.config ?? getGatewayOpsAlertConfig();
  const emit = deps.emitAlert ?? emitOpsAlert;
  const incr = deps.incrementWindow ?? incrementOpsAlertWindow;

  const window = await incr(deps.counterClient, {
    keyParts: ['webhook_signature', provider, reason],
    threshold: config.webhookSignatureThreshold,
    windowSecs: config.windowSecs,
    nowMs: deps.nowMs,
  });

  if (window.thresholdCrossed) {
    emit({
      category: 'webhook_signature',
      message: `Repeated webhook signature failure: provider=${provider} reason=${reason} count=${window.count}`,
      level: 'warning',
      tags: { provider, reason },
      extra: {
        count: window.count,
        threshold: window.threshold,
        windowSecs: config.windowSecs,
        resetAt: window.resetAt,
      },
    });
  }

  return { window, emitted: window.thresholdCrossed };
}
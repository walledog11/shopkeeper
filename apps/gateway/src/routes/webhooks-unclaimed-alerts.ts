import {
  emitOpsAlert,
  incrementOpsAlertWindow,
  type OpsAlertCounterClient,
  type IncrementOpsAlertWindowResult,
} from '../ops-alerts.js';
import { getGatewayOpsAlertConfig, type GatewayOpsAlertConfig } from '../config/runtime-config.js';

export type UnclaimedInboundReason =
  | 'missing_recipient'
  | 'malformed_local_part'
  | 'no_integration';

export interface UnclaimedInboundAlertDependencies {
  counterClient: OpsAlertCounterClient;
  config?: GatewayOpsAlertConfig;
  emitAlert?: typeof emitOpsAlert;
  incrementWindow?: typeof incrementOpsAlertWindow;
  nowMs?: number;
  recipientDomain?: string | null;
}

export interface UnclaimedInboundAlertResult {
  window: IncrementOpsAlertWindowResult;
  emitted: boolean;
}

// The route answers 200 for mail it discards — Postmark must not retry a
// message we will never claim — so an inbound misconfiguration looks perfectly
// healthy from the sender's side. The per-recipient counter that already
// existed lived in a key nobody reads; this turns a sustained rate into an
// alert, keyed by reason so the alert names what to go and fix.
export async function recordUnclaimedInbound(
  reason: UnclaimedInboundReason,
  deps: UnclaimedInboundAlertDependencies,
): Promise<UnclaimedInboundAlertResult> {
  const config = deps.config ?? getGatewayOpsAlertConfig();
  const emit = deps.emitAlert ?? emitOpsAlert;
  const incr = deps.incrementWindow ?? incrementOpsAlertWindow;
  const recipientDomain = deps.recipientDomain?.trim() || 'unknown';

  const window = await incr(deps.counterClient, {
    keyParts: ['inbound_unclaimed', reason],
    threshold: config.unclaimedRecipientThreshold,
    windowSecs: config.windowSecs,
    nowMs: deps.nowMs,
  });

  if (window.thresholdCrossed) {
    emit({
      category: 'inbound_unclaimed',
      message: `Inbound email repeatedly unclaimed: reason=${reason} count=${window.count}`,
      level: 'warning',
      tags: { reason, recipientDomain },
      fingerprint: ['ops-alert', 'inbound_unclaimed', 'gateway', `reason:${reason}`],
      extra: {
        route: '/webhooks/email/inbound',
        count: window.count,
        threshold: window.threshold,
        windowSecs: config.windowSecs,
        resetAt: window.resetAt,
      },
    });
  }

  return { window, emitted: window.thresholdCrossed };
}

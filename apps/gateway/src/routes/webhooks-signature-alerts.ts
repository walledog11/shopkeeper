import {
  emitOpsAlert,
  incrementOpsAlertWindow,
  type OpsAlertCounterClient,
  type IncrementOpsAlertWindowResult,
} from '../ops-alerts.js';
import { getGatewayOpsAlertConfig, type GatewayOpsAlertConfig } from '../config/runtime-config.js';
import type { Request } from 'express';

export type WebhookSignatureProvider = 'meta' | 'shopify' | 'telegram';
export type WebhookSignatureFailureReason =
  | 'missing_signature'
  | 'missing_raw_body'
  | 'signature_mismatch';

export interface WebhookSignatureAlertDependencies {
  counterClient: OpsAlertCounterClient;
  config?: GatewayOpsAlertConfig;
  emitAlert?: typeof emitOpsAlert;
  incrementWindow?: typeof incrementOpsAlertWindow;
  nowMs?: number;
  route?: string | null;
  request?: WebhookSignatureRequestMetadata | null;
}

export interface WebhookSignatureAlertResult {
  window: IncrementOpsAlertWindowResult;
  emitted: boolean;
}

export interface WebhookSignatureRequestMetadata {
  method: string | null;
  path: string | null;
  userAgent: string | null;
  contentType: string | null;
  requestId: string | null;
  ip: string | null;
}

export function buildWebhookSignatureRequestMetadata(req: Request): WebhookSignatureRequestMetadata {
  return {
    method: normalizeText(req.method),
    path: normalizeText(`${req.baseUrl ?? ''}${req.path ?? ''}`) ?? normalizeText(req.originalUrl?.split('?')[0]),
    userAgent: readHeader(req, 'user-agent'),
    contentType: readHeader(req, 'content-type'),
    requestId: readHeader(req, 'x-request-id'),
    ip: normalizeText(req.ip),
  };
}

export async function recordWebhookSignatureFailure(
  provider: WebhookSignatureProvider,
  reason: WebhookSignatureFailureReason,
  deps: WebhookSignatureAlertDependencies,
): Promise<WebhookSignatureAlertResult> {
  const config = deps.config ?? getGatewayOpsAlertConfig();
  const emit = deps.emitAlert ?? emitOpsAlert;
  const incr = deps.incrementWindow ?? incrementOpsAlertWindow;
  const route = normalizeText(deps.route) ?? normalizeText(deps.request?.path) ?? 'unknown';

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
      tags: { provider, reason, route },
      fingerprint: [
        'ops-alert',
        'webhook_signature',
        'gateway',
        `provider:${provider}`,
        `reason:${reason}`,
      ],
      extra: {
        route,
        request: deps.request ?? null,
        count: window.count,
        threshold: window.threshold,
        windowSecs: config.windowSecs,
        resetAt: window.resetAt,
      },
    });
  }

  return { window, emitted: window.thresholdCrossed };
}

function readHeader(req: Request, name: string): string | null {
  const value = req.headers[name.toLowerCase()];
  if (Array.isArray(value)) {
    return normalizeText(value[0]);
  }
  return normalizeText(value);
}

function normalizeText(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

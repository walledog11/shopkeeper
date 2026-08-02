import * as Sentry from '@sentry/nextjs';
import logger from '@/lib/server/logger';
import type { OpsAlertCaptureContext, OpsAlertInput } from '@shopkeeper/agent/observability';

const ERROR_DETAIL_LIMIT = 300;

/**
 * `buildOpsAlertScope` already produces Sentry's capture shape — level, tags,
 * extra, fingerprint — so the only translation needed is folding `input.error`
 * into `extra`. The deliberate fingerprint is why this is `captureMessage` and
 * not `captureException`: an exception would regroup these by stack trace and
 * lose the per-category grouping the alert engine computes.
 */
export function buildOpsAlertCaptureContext(
  input: OpsAlertInput,
  scope: OpsAlertCaptureContext,
): {
  level: OpsAlertCaptureContext['level'];
  tags: OpsAlertCaptureContext['tags'];
  extra: Record<string, unknown>;
  fingerprint: string[];
} {
  const detail = input.error instanceof Error ? input.error.message : String(input.error ?? '');

  return {
    level: scope.level,
    tags: scope.tags,
    extra: {
      ...scope.extra,
      ...(input.error !== undefined ? { error: detail.slice(0, ERROR_DETAIL_LIMIT) } : {}),
    },
    fingerprint: scope.fingerprint,
  };
}

/**
 * Best-effort ops-alert capture to Sentry. The alert is already durable in the
 * log stream by the time we run, so a capture failure can only ever cost one
 * log line — it must never propagate to the caller that raised the alert.
 */
export function captureOpsAlertToSentry(
  input: OpsAlertInput,
  scope: OpsAlertCaptureContext,
): boolean {
  try {
    Sentry.captureMessage(input.message, buildOpsAlertCaptureContext(input, scope));
    return true;
  } catch (error) {
    logger.warn({ err: (error as Error).message }, '[OpsAlert] Sentry capture errored');
    return false;
  }
}

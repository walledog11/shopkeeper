import { getDashboardOpsAlertConfig, type DashboardOpsAlertConfig } from '@/lib/env';
import logger from '@/lib/server/logger';
import { captureOpsAlertToSentry } from '@/lib/server/ops-alert-notify';
import {
  buildOpsAlertScope,
  emitOpsAlert as emitOpsAlertCore,
  type EmitOpsAlertResult,
  type OpsAlertInput,
  type OpsAlertLogger,
} from '@shopkeeper/agent/observability';

export interface EmitOpsAlertDependencies {
  config?: DashboardOpsAlertConfig;
  logger?: OpsAlertLogger;
  capture?: typeof captureOpsAlertToSentry;
}

export function emitOpsAlert(
  input: OpsAlertInput,
  dependencies: EmitOpsAlertDependencies = {},
): EmitOpsAlertResult {
  const result = emitOpsAlertCore(input, {
    config: dependencies.config ?? getDashboardOpsAlertConfig(),
    logger: dependencies.logger ?? logger,
    defaultService: 'dashboard',
  });

  // The dashboard has no Telegram credentials, so Sentry is its paging surface.
  // Best-effort: the log line is the durable record, the capture is the push.
  if (result.logged) {
    const capture = dependencies.capture ?? captureOpsAlertToSentry;
    capture(input, buildOpsAlertScope(input, 'dashboard'));
  }

  return result;
}

export {
  buildOpsAlertScope,
  incrementOpsAlertWindow,
} from '@shopkeeper/agent/observability';
export type {
  EmitOpsAlertResult,
  IncrementOpsAlertWindowResult,
  OpsAlertCounterClient,
  OpsAlertInput,
  OpsAlertLogger,
} from '@shopkeeper/agent/observability';

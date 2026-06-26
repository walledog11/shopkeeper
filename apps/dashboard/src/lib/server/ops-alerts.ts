import { getDashboardOpsAlertConfig, type DashboardOpsAlertConfig } from '@/lib/env';
import logger from '@/lib/server/logger';
import {
  emitOpsAlert as emitOpsAlertCore,
  type EmitOpsAlertResult,
  type OpsAlertInput,
  type OpsAlertLogger,
} from '@shopkeeper/agent/observability';

export interface EmitOpsAlertDependencies {
  config?: DashboardOpsAlertConfig;
  logger?: OpsAlertLogger;
}

export function emitOpsAlert(
  input: OpsAlertInput,
  dependencies: EmitOpsAlertDependencies = {},
): EmitOpsAlertResult {
  return emitOpsAlertCore(input, {
    config: dependencies.config ?? getDashboardOpsAlertConfig(),
    logger: dependencies.logger ?? logger,
    defaultService: 'dashboard',
  });
}

export {
  OPS_ALERT_CATEGORIES,
  buildOpsAlertScope,
  buildOpsAlertWindowKey,
  incrementOpsAlertWindow,
} from '@shopkeeper/agent/observability';
export type {
  EmitOpsAlertResult,
  IncrementOpsAlertWindowOptions,
  IncrementOpsAlertWindowResult,
  OpsAlertCaptureContext,
  OpsAlertCategory,
  OpsAlertCounterClient,
  OpsAlertInput,
  OpsAlertLogger,
  OpsAlertService,
  OpsAlertSeverity,
  OpsAlertTagValue,
} from '@shopkeeper/agent/observability';

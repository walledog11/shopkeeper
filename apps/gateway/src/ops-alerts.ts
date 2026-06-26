import { getGatewayOpsAlertConfig, type GatewayOpsAlertConfig } from './config/runtime-config.js';
import logger from './logger.js';
import {
  emitOpsAlert as emitOpsAlertCore,
  type EmitOpsAlertResult,
  type OpsAlertInput,
  type OpsAlertLogger,
} from '@shopkeeper/agent/observability';

export interface EmitOpsAlertDependencies {
  config?: GatewayOpsAlertConfig;
  logger?: OpsAlertLogger;
}

export function emitOpsAlert(
  input: OpsAlertInput,
  dependencies: EmitOpsAlertDependencies = {},
): EmitOpsAlertResult {
  return emitOpsAlertCore(input, {
    config: dependencies.config ?? getGatewayOpsAlertConfig(),
    logger: dependencies.logger ?? logger,
    defaultService: 'gateway',
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

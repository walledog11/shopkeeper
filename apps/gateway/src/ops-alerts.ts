import { getGatewayOpsAlertConfig, type GatewayOpsAlertConfig } from './config/runtime-config.js';
import logger from './logger.js';
import { dispatchOpsAlertToTelegram } from './ops-alert-notify.js';
import {
  buildOpsAlertScope,
  emitOpsAlert as emitOpsAlertCore,
  type EmitOpsAlertResult,
  type OpsAlertInput,
  type OpsAlertLogger,
} from '@shopkeeper/agent/observability';

export interface EmitOpsAlertDependencies {
  config?: GatewayOpsAlertConfig;
  logger?: OpsAlertLogger;
  dispatch?: typeof dispatchOpsAlertToTelegram;
}

export function emitOpsAlert(
  input: OpsAlertInput,
  dependencies: EmitOpsAlertDependencies = {},
): EmitOpsAlertResult {
  const config = dependencies.config ?? getGatewayOpsAlertConfig();
  const result = emitOpsAlertCore(input, {
    config,
    logger: dependencies.logger ?? logger,
    defaultService: 'gateway',
  });

  // Fire-and-forget: the alert is already durable in the log stream, so the
  // push must never delay or fail the caller that raised it.
  if (result.logged && config.telegramChatId) {
    const dispatch = dependencies.dispatch ?? dispatchOpsAlertToTelegram;
    void dispatch(input, buildOpsAlertScope(input, 'gateway'), config.telegramChatId);
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

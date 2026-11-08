import { getGatewayOpsAlertConfig, type GatewayOpsAlertConfig } from './config/runtime-config.js';
import logger from './logger.js';
import { getOpsAlertCounterClient } from './ops-alert-counter.js';
import { dispatchOpsAlertToTelegram } from './ops-alert-notify.js';
import {
  buildOpsAlertScope,
  emitOpsAlert as emitOpsAlertCore,
  incrementOpsAlertWindow,
  type EmitOpsAlertResult,
  type OpsAlertCounterClient,
  type OpsAlertInput,
  type OpsAlertLogger,
} from '@shopkeeper/agent/observability';

export interface EmitOpsAlertDependencies {
  config?: GatewayOpsAlertConfig;
  logger?: OpsAlertLogger;
  dispatch?: typeof dispatchOpsAlertToTelegram;
  /**
   * For an alert whose cause raises it again on its own (a sweep, a retry, every
   * message past a limit). Each occurrence is still logged; the chat hears about
   * the alert's fingerprint once per this many seconds.
   */
  pushOncePerSecs?: number;
  counterClient?: OpsAlertCounterClient;
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
    const scope = buildOpsAlertScope(input, 'gateway');
    const chatId = config.telegramChatId;
    if (dependencies.pushOncePerSecs === undefined) {
      void dispatch(input, scope, chatId);
    } else {
      void firstPushInWindow(scope.fingerprint, dependencies.pushOncePerSecs, dependencies.counterClient)
        .then(first => (first ? dispatch(input, scope, chatId) : false));
    }
  }

  return result;
}

// A counter failure pushes anyway: a repeat beats silence.
async function firstPushInWindow(
  fingerprint: readonly string[],
  windowSecs: number,
  counterClient: OpsAlertCounterClient | undefined,
): Promise<boolean> {
  try {
    const window = await incrementOpsAlertWindow(counterClient ?? getOpsAlertCounterClient(), {
      keyParts: fingerprint,
      threshold: 1,
      windowSecs,
      prefix: 'ops-alert-push',
    });
    return window.thresholdCrossed;
  } catch {
    return true;
  }
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

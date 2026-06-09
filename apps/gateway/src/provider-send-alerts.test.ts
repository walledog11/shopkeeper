import { describe, expect, it, vi } from 'vitest';
import type { GatewayOpsAlertConfig } from './config/runtime-config.js';
import {
  emitOpsAlert,
  type EmitOpsAlertResult,
  type OpsAlertCounterClient,
  type OpsAlertLogger,
} from './ops-alerts.js';
import {
  recordProviderSendFailure,
  type ProviderSendAlertDependencies,
} from './provider-send-alerts.js';

const CONFIG: GatewayOpsAlertConfig = {
  enabled: true,
  windowSecs: 300,
  queueFailedThreshold: 10,
  queueWaitingThreshold: 100,
  queueActiveStuckMs: 900_000,
  webhookSignatureThreshold: 5,
  providerSendThreshold: 3,
  agentFailureThreshold: 3,
};

const LOG_ONLY_RESULT: EmitOpsAlertResult = {
  logged: true,
  reason: 'logged',
};

describe('recordProviderSendFailure', () => {
  it('does not emit below the threshold and emits once at the threshold', async () => {
    const { client } = createCounterClient();
    const emitAlert = createEmitAlert();

    for (let i = 1; i < CONFIG.providerSendThreshold; i++) {
      const result = await recordProviderSendFailure(
        'telegram',
        'operator_notify',
        'org_abc',
        makeDeps(client, { emitAlert }),
      );
      expect(result.emitted).toBe(false);
    }

    expect(emitAlert).not.toHaveBeenCalled();

    await recordProviderSendFailure(
      'telegram',
      'operator_notify',
      'org_abc',
      makeDeps(client, { emitAlert }),
    );

    expect(emitAlert).toHaveBeenCalledTimes(1);
    expect(emitAlert.mock.calls[0]?.[0]).toMatchObject({
      category: 'provider_send',
      level: 'error',
      tags: { provider: 'telegram', channel: 'operator_notify' },
      extra: {
        orgId: 'org_abc',
        count: CONFIG.providerSendThreshold,
        threshold: CONFIG.providerSendThreshold,
      },
    });
  });

  it('groups unknown org ids under a shared counter bucket', async () => {
    const { client } = createCounterClient();
    const emitAlert = createEmitAlert();

    for (let i = 1; i <= CONFIG.providerSendThreshold; i++) {
      await recordProviderSendFailure(
        'telegram',
        'operator_notify',
        null,
        makeDeps(client, { emitAlert }),
      );
    }

    expect(emitAlert).toHaveBeenCalledTimes(1);
    expect(emitAlert.mock.calls[0]?.[0].extra).toMatchObject({ orgId: 'unknown' });
  });

  it('includes optional thread and detail metadata', async () => {
    const { client } = createCounterClient();
    const emitAlert = createEmitAlert();

    for (let i = 1; i <= CONFIG.providerSendThreshold; i++) {
      await recordProviderSendFailure(
        'telegram',
        'operator_notify',
        'org_abc',
        makeDeps(client, {
          emitAlert,
          threadId: 'thread_123',
          detail: 'HTTP 429',
          extra: { chatId: 'chat_1', status: 429 },
        }),
      );
    }

    expect(emitAlert.mock.calls[0]?.[0].extra).toMatchObject({
      threadId: 'thread_123',
      detail: 'HTTP 429',
      chatId: 'chat_1',
      status: 429,
    });
  });

  it('does not log alerts when alerts are disabled', async () => {
    const { client } = createCounterClient();
    const { logger, calls } = createTestLogger();

    const realEmitDisabled: typeof emitOpsAlert = (input) =>
      emitOpsAlert(input, {
        config: { ...CONFIG, enabled: false },
        logger,
      });

    for (let i = 1; i <= CONFIG.providerSendThreshold; i++) {
      await recordProviderSendFailure(
        'telegram',
        'operator_notify',
        'org_abc',
        makeDeps(client, {
          config: { ...CONFIG, enabled: false },
          emitAlert: realEmitDisabled,
        }),
      );
    }

    expect(calls).toHaveLength(0);
  });

  it('does not emit twice within the same threshold window', async () => {
    const { client } = createCounterClient();
    const emitAlert = createEmitAlert();
    const deps = makeDeps(client, { emitAlert, nowMs: 301_000 });

    for (let i = 1; i <= CONFIG.providerSendThreshold + 1; i++) {
      await recordProviderSendFailure('telegram', 'operator_notify', 'org_a', deps);
    }

    expect(emitAlert).toHaveBeenCalledTimes(1);
  });
});

function createEmitAlert() {
  return vi.fn<(input: Parameters<typeof emitOpsAlert>[0], deps?: Parameters<typeof emitOpsAlert>[1]) => EmitOpsAlertResult>(
    () => LOG_ONLY_RESULT,
  );
}

function createCounterClient(): { client: OpsAlertCounterClient } {
  const counts = new Map<string, number>();

  return {
    client: {
      incr: async (key) => {
        const next = (counts.get(key) ?? 0) + 1;
        counts.set(key, next);
        return next;
      },
      expire: async () => {},
    },
  };
}

function makeDeps(
  client: OpsAlertCounterClient,
  overrides: Partial<ProviderSendAlertDependencies> = {},
): ProviderSendAlertDependencies {
  return {
    counterClient: client,
    config: CONFIG,
    ...overrides,
  };
}

function createTestLogger(): {
  logger: OpsAlertLogger;
  calls: Array<{ level: 'info' | 'warn' | 'error'; fields: Record<string, unknown>; message: string }>;
} {
  const calls: Array<{ level: 'info' | 'warn' | 'error'; fields: Record<string, unknown>; message: string }> = [];

  return {
    logger: {
      info: (fields, message) => calls.push({ level: 'info', fields, message }),
      warn: (fields, message) => calls.push({ level: 'warn', fields, message }),
      error: (fields, message) => calls.push({ level: 'error', fields, message }),
    },
    calls,
  };
}

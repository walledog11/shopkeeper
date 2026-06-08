import { afterEach, describe, expect, it } from 'vitest';
import type { GatewayOpsAlertConfig } from './config/runtime-config.js';
import {
  buildOpsAlertScope,
  emitOpsAlert,
  incrementOpsAlertWindow,
  type OpsAlertCounterClient,
  type OpsAlertLogger,
} from './ops-alerts.js';

const DEFAULT_CONFIG: GatewayOpsAlertConfig = {
  enabled: true,
  windowSecs: 300,
  queueFailedThreshold: 10,
  queueWaitingThreshold: 100,
  queueActiveStuckMs: 900_000,
  webhookSignatureThreshold: 5,
  providerSendThreshold: 3,
  agentFailureThreshold: 3,
};

afterEach(() => {
  // no env stubs
});

describe('buildOpsAlertScope', () => {
  it('builds stable tags and fingerprints without org-level fragmentation', () => {
    const scope = buildOpsAlertScope({
      category: 'queue_health',
      message: 'Inbound jobs are stuck',
      tags: {
        queue: 'inbound',
        orgId: 'org_123',
      },
    }, 'gateway');

    expect(scope.tags).toMatchObject({
      category: 'queue_health',
      service: 'gateway',
      queue: 'inbound',
      orgId: 'org_123',
    });
    expect(scope.fingerprint).toEqual([
      'ops-alert',
      'queue_health',
      'gateway',
      'queue:inbound',
    ]);
  });
});

describe('emitOpsAlert', () => {
  it('logs alerts when enabled', () => {
    const { logger, calls } = createTestLogger();

    const result = emitOpsAlert({
      category: 'provider_send',
      message: 'Postmark sends are failing',
      tags: { provider: 'postmark', channel: 'email' },
    }, {
      config: DEFAULT_CONFIG,
      logger,
    });

    expect(result).toEqual({ logged: true, reason: 'logged' });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.level).toBe('warn');
  });

  it('logs exceptions with alert context', () => {
    const { logger, calls } = createTestLogger();
    const error = new Error('tool failed');

    const result = emitOpsAlert({
      category: 'agent_failure',
      message: 'Agent tool threw',
      level: 'error',
      tags: { tool: 'send_reply' },
      error,
    }, {
      config: DEFAULT_CONFIG,
      logger,
    });

    expect(result).toEqual({ logged: true, reason: 'logged' });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.level).toBe('error');
    expect(calls[0]?.fields.err).toBe('tool failed');
  });

  it('skips logging when OPS_ALERTS_ENABLED is false', () => {
    const { logger, calls } = createTestLogger();

    const result = emitOpsAlert({
      category: 'provider_send',
      message: 'Provider failure',
    }, {
      config: { ...DEFAULT_CONFIG, enabled: false },
      logger,
    });

    expect(result).toEqual({ logged: false, reason: 'disabled' });
    expect(calls).toHaveLength(0);
  });
});

describe('incrementOpsAlertWindow', () => {
  it('increments fixed-window counters and expires the first hit', async () => {
    const { client, expireCalls } = createCounterClient();

    const first = await incrementOpsAlertWindow(client, {
      keyParts: ['webhook_signature', 'meta', 'missing_signature'],
      threshold: 2,
      windowSecs: 300,
      nowMs: 301_000,
    });
    const second = await incrementOpsAlertWindow(client, {
      keyParts: ['webhook_signature', 'meta', 'missing_signature'],
      threshold: 2,
      windowSecs: 300,
      nowMs: 301_000,
    });
    const third = await incrementOpsAlertWindow(client, {
      keyParts: ['webhook_signature', 'meta', 'missing_signature'],
      threshold: 2,
      windowSecs: 300,
      nowMs: 301_000,
    });

    expect(first).toMatchObject({
      key: 'ops-alert:webhook_signature:meta:missing_signature:1',
      count: 1,
      thresholdCrossed: false,
      overThreshold: false,
      resetAt: 600,
    });
    expect(second).toMatchObject({ count: 2, thresholdCrossed: true, overThreshold: true });
    expect(third).toMatchObject({ count: 3, thresholdCrossed: false, overThreshold: true });
    expect(expireCalls).toEqual([['ops-alert:webhook_signature:meta:missing_signature:1', 300]]);
  });

  it('rejects invalid thresholds and windows', async () => {
    const { client } = createCounterClient();

    await expect(incrementOpsAlertWindow(client, {
      keyParts: ['agent_failure'],
      threshold: 0,
      windowSecs: 300,
    })).rejects.toThrow(/threshold/);

    await expect(incrementOpsAlertWindow(client, {
      keyParts: ['agent_failure'],
      threshold: 3,
      windowSecs: 0,
    })).rejects.toThrow(/windowSecs/);
  });
});

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

function createCounterClient(): {
  client: OpsAlertCounterClient;
  expireCalls: Array<[string, number]>;
} {
  const counts = new Map<string, number>();
  const expireCalls: Array<[string, number]> = [];

  return {
    client: {
      incr: async (key) => {
        const next = (counts.get(key) ?? 0) + 1;
        counts.set(key, next);
        return next;
      },
      expire: async (key, seconds) => {
        expireCalls.push([key, seconds]);
      },
    },
    expireCalls,
  };
}

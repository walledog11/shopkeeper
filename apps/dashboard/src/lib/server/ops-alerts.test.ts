import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DashboardOpsAlertConfig } from '@/lib/env';
import {
  buildOpsAlertScope,
  emitOpsAlert,
  incrementOpsAlertWindow,
  type OpsAlertCaptureContext,
  type OpsAlertCounterClient,
  type OpsAlertLogger,
  type OpsAlertSentryClient,
} from './ops-alerts';

vi.mock('@sentry/nextjs', () => ({
  captureMessage: vi.fn(),
  captureException: vi.fn(),
  isEnabled: vi.fn(() => true),
}));

const DEFAULT_CONFIG: DashboardOpsAlertConfig = {
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
  vi.unstubAllEnvs();
});

describe('dashboard ops alerts', () => {
  it('builds dashboard-scoped Sentry context', () => {
    const scope = buildOpsAlertScope({
      category: 'provider_send',
      message: 'Meta sends are failing',
      tags: {
        provider: 'meta',
        channel: 'ig_dm',
        orgId: 'org_123',
      },
    }, 'dashboard');

    expect(scope.tags).toMatchObject({
      category: 'provider_send',
      service: 'dashboard',
      provider: 'meta',
      channel: 'ig_dm',
      orgId: 'org_123',
    });
    expect(scope.fingerprint).toEqual([
      'ops-alert',
      'provider_send',
      'dashboard',
      'provider:meta',
      'channel:ig_dm',
    ]);
  });

  it('captures messages when alerts and Sentry are enabled', () => {
    const { logger, calls } = createTestLogger();
    const { sentry, messages } = createTestSentry();

    const result = emitOpsAlert({
      category: 'agent_failure',
      message: 'Agent route failures exceeded threshold',
      tags: { tool: 'send_reply' },
    }, {
      config: DEFAULT_CONFIG,
      env: createTestEnv({ SENTRY_DSN: 'https://example.invalid/1' }),
      logger,
      sentry,
    });

    expect(result).toEqual({ logged: true, captured: true, eventId: 'message-event-id', reason: 'captured' });
    expect(calls).toHaveLength(1);
    expect(messages[0]?.context.tags).toMatchObject({
      category: 'agent_failure',
      service: 'dashboard',
      tool: 'send_reply',
    });
  });

  it('logs but skips Sentry when alerts are disabled', () => {
    const { logger, calls } = createTestLogger();
    const { sentry, messages } = createTestSentry();

    const result = emitOpsAlert({
      category: 'provider_send',
      message: 'Provider failure',
    }, {
      config: { ...DEFAULT_CONFIG, enabled: false },
      env: createTestEnv({ SENTRY_DSN: 'https://example.invalid/1' }),
      logger,
      sentry,
    });

    expect(result).toEqual({ logged: true, captured: false, eventId: null, reason: 'disabled' });
    expect(calls).toHaveLength(1);
    expect(messages).toHaveLength(0);
  });

  it('increments Upstash-compatible fixed-window counters', async () => {
    const { client, expireCalls } = createCounterClient();

    const first = await incrementOpsAlertWindow(client, {
      keyParts: ['agent_failure', 'org_123', 'send_reply'],
      threshold: 2,
      windowSecs: 300,
      nowMs: 301_000,
    });
    const second = await incrementOpsAlertWindow(client, {
      keyParts: ['agent_failure', 'org_123', 'send_reply'],
      threshold: 2,
      windowSecs: 300,
      nowMs: 301_000,
    });

    expect(first).toMatchObject({
      key: 'ops-alert:agent_failure:org_123:send_reply:1',
      count: 1,
      thresholdCrossed: false,
      overThreshold: false,
      resetAt: 600,
    });
    expect(second).toMatchObject({ count: 2, thresholdCrossed: true, overThreshold: true });
    expect(expireCalls).toEqual([['ops-alert:agent_failure:org_123:send_reply:1', 300]]);
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

function createTestEnv(overrides: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return { ...process.env, ...overrides };
}

function createTestSentry(enabled = true): {
  sentry: OpsAlertSentryClient;
  messages: Array<{ message: string; context: OpsAlertCaptureContext }>;
} {
  const messages: Array<{ message: string; context: OpsAlertCaptureContext }> = [];

  return {
    sentry: {
      captureMessage: (message, context) => {
        messages.push({ message, context: context! });
        return 'message-event-id';
      },
      captureException: () => 'exception-event-id',
      isEnabled: () => enabled,
    },
    messages,
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

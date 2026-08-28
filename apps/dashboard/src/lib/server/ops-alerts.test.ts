import { afterEach, describe, expect, it } from 'vitest';
import {
  createOpsAlertCounterClient as createCounterClient,
  createOpsAlertRecordingLogger as createTestLogger,
} from '@shopkeeper/agent/testing';
import type { DashboardOpsAlertConfig } from '@/lib/env';
import {
  buildOpsAlertScope,
  emitOpsAlert,
  incrementOpsAlertWindow,
} from './ops-alerts';

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
  // no env stubs
});

describe('dashboard ops alerts', () => {
  it('builds dashboard-scoped alert context', () => {
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

  it('logs alerts when enabled and pushes them to Sentry', () => {
    const { logger, calls } = createTestLogger();
    const captured: Array<{ message: string; fingerprint: string[] }> = [];

    const result = emitOpsAlert({
      category: 'agent_failure',
      message: 'Agent route failures exceeded threshold',
      tags: { tool: 'send_reply' },
    }, {
      config: DEFAULT_CONFIG,
      logger,
      capture: (input, scope) => {
        captured.push({ message: input.message, fingerprint: scope.fingerprint });
        return true;
      },
    });

    expect(result).toEqual({ logged: true, reason: 'logged' });
    expect(calls).toHaveLength(1);
    expect(captured).toEqual([{
      message: 'Agent route failures exceeded threshold',
      fingerprint: ['ops-alert', 'agent_failure', 'dashboard', 'tool:send_reply'],
    }]);
  });

  it('skips logging when alerts are disabled', () => {
    const { logger, calls } = createTestLogger();
    let captureCalls = 0;

    const result = emitOpsAlert({
      category: 'provider_send',
      message: 'Provider failure',
    }, {
      config: { ...DEFAULT_CONFIG, enabled: false },
      logger,
      capture: () => {
        captureCalls += 1;
        return true;
      },
    });

    expect(result).toEqual({ logged: false, reason: 'disabled' });
    expect(calls).toHaveLength(0);
    expect(captureCalls).toBe(0);
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


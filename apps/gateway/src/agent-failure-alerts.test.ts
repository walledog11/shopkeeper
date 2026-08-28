import { describe, expect, it, vi } from 'vitest';
import {
  createOpsAlertCounterClient as createCounterClient,
  createOpsAlertRecordingLogger as createTestLogger,
} from '@shopkeeper/agent/testing';
import type { GatewayOpsAlertConfig } from './config/runtime-config.js';
import {
  emitOpsAlert,
  type EmitOpsAlertResult,
  type OpsAlertCounterClient,
} from './ops-alerts.js';
import {
  recordAgentFailure,
  type AgentFailureAlertDependencies,
} from './agent-failure-alerts.js';

const CONFIG: GatewayOpsAlertConfig = {
  enabled: true,
  windowSecs: 300,
  queueFailedThreshold: 10,
  queueWaitingThreshold: 100,
  queueActiveStuckMs: 900_000,
  webhookSignatureThreshold: 5,
  providerSendThreshold: 3,
  agentFailureThreshold: 3,
  unclaimedRecipientThreshold: 5,
};

const LOG_ONLY_RESULT: EmitOpsAlertResult = {
  logged: true,
  reason: 'logged',
};

describe('recordAgentFailure', () => {
  it('does not emit below the threshold and emits once at the threshold', async () => {
    const { client } = createCounterClient();
    const emitAlert = createEmitAlert();

    for (let i = 1; i < CONFIG.agentFailureThreshold; i++) {
      const result = await recordAgentFailure({
        kind: 'tool_result',
        route: 'gateway-thread-sink',
        orgId: 'org_abc',
        tool: 'send_reply',
        statusCode: 502,
        detail: 'Bad gateway',
      }, makeDeps(client, { emitAlert }));
      expect(result.emitted).toBe(false);
    }

    expect(emitAlert).not.toHaveBeenCalled();

    await recordAgentFailure({
      kind: 'tool_result',
      route: 'gateway-thread-sink',
      orgId: 'org_abc',
      tool: 'send_reply',
      statusCode: 502,
      detail: 'Bad gateway',
    }, makeDeps(client, { emitAlert }));

    expect(emitAlert).toHaveBeenCalledTimes(1);
    expect(emitAlert.mock.calls[0]?.[0]).toMatchObject({
      category: 'agent_failure',
      level: 'error',
      tags: { route: 'gateway-thread-sink', tool: 'send_reply' },
      fingerprint: [
        'ops-alert',
        'agent_failure',
        'gateway',
        'kind:tool_result',
        'route:gateway-thread-sink',
        'tool:send_reply',
      ],
      extra: {
        kind: 'tool_result',
        orgId: 'org_abc',
        statusCode: 502,
        detail: 'Bad gateway',
        count: CONFIG.agentFailureThreshold,
        threshold: CONFIG.agentFailureThreshold,
      },
    });
  });

  it('formats tool_exception messages separately', async () => {
    const { client } = createCounterClient();
    const emitAlert = createEmitAlert();

    for (let i = 1; i <= CONFIG.agentFailureThreshold; i++) {
      await recordAgentFailure({
        kind: 'tool_exception',
        route: 'gateway-thread-sink',
        orgId: 'org_abc',
        tool: 'send_email',
        detail: 'fetch failed',
      }, makeDeps(client, { emitAlert }));
    }

    expect(emitAlert.mock.calls[0]?.[0].message).toContain('tool exception');
    expect(emitAlert.mock.calls[0]?.[0].message).toContain('send_email');
  });

  it('normalizes missing org and tool values', async () => {
    const { client } = createCounterClient();
    const emitAlert = createEmitAlert();

    for (let i = 1; i <= CONFIG.agentFailureThreshold; i++) {
      await recordAgentFailure({
        kind: 'tool_result',
        route: 'gateway-thread-sink',
      }, makeDeps(client, { emitAlert }));
    }

    expect(emitAlert.mock.calls[0]?.[0].extra).toMatchObject({
      orgId: 'unknown',
      tool: 'unknown',
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

    for (let i = 1; i <= CONFIG.agentFailureThreshold; i++) {
      await recordAgentFailure({
        kind: 'tool_result',
        route: 'gateway-thread-sink',
        orgId: 'org_abc',
        tool: 'send_reply',
      }, makeDeps(client, {
        config: { ...CONFIG, enabled: false },
        emitAlert: realEmitDisabled,
      }));
    }

    expect(calls).toHaveLength(0);
  });

  it('does not emit twice within the same threshold window', async () => {
    const { client } = createCounterClient();
    const emitAlert = createEmitAlert();
    const deps = makeDeps(client, { emitAlert, nowMs: 301_000 });

    for (let i = 1; i <= CONFIG.agentFailureThreshold + 1; i++) {
      await recordAgentFailure({
        kind: 'tool_result',
        route: 'gateway-thread-sink',
        orgId: 'org_a',
        tool: 'send_reply',
      }, deps);
    }

    expect(emitAlert).toHaveBeenCalledTimes(1);
  });
});

function createEmitAlert() {
  return vi.fn<(input: Parameters<typeof emitOpsAlert>[0], deps?: Parameters<typeof emitOpsAlert>[1]) => EmitOpsAlertResult>(
    () => LOG_ONLY_RESULT,
  );
}

function makeDeps(
  client: OpsAlertCounterClient,
  overrides: Partial<AgentFailureAlertDependencies> = {},
): AgentFailureAlertDependencies {
  return {
    counterClient: client,
    config: CONFIG,
    ...overrides,
  };
}


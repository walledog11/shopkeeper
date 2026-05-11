import { describe, expect, it, vi } from 'vitest';
import type { DashboardOpsAlertConfig } from '@/lib/env';
import type { EmitOpsAlertResult, OpsAlertCounterClient } from '@/lib/server/ops-alerts';
import {
  recordAgentFailure,
  recordAgentRouteFailure,
  type AgentFailureAlertDependencies,
} from './agent-failure-alerts';

const CONFIG: DashboardOpsAlertConfig = {
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
  captured: false,
  eventId: null,
  reason: 'missing_dsn',
};

function createCounterClient(): { client: OpsAlertCounterClient } {
  const counts = new Map<string, number>();
  return {
    client: {
      incr: async (key) => {
        const next = (counts.get(key) ?? 0) + 1;
        counts.set(key, next);
        return next;
      },
      expire: async () => undefined,
    },
  };
}

function createEmitAlert() {
  return vi.fn<NonNullable<AgentFailureAlertDependencies['emitAlert']>>(() => LOG_ONLY_RESULT);
}

function makeDeps(
  client: OpsAlertCounterClient,
  overrides: Partial<AgentFailureAlertDependencies> = {},
): AgentFailureAlertDependencies {
  return { counterClient: client, config: CONFIG, nowMs: 301_000, ...overrides };
}

describe('recordAgentFailure', () => {
  it('does not emit a route alert below the threshold', async () => {
    const { client } = createCounterClient();
    const emitAlert = createEmitAlert();

    for (let i = 1; i < CONFIG.agentFailureThreshold; i++) {
      const result = await recordAgentFailure({
        kind: 'route_failure',
        route: '/api/agent',
        orgId: 'org_123',
      }, makeDeps(client, { emitAlert }));
      expect(result.emitted).toBe(false);
    }

    expect(emitAlert).not.toHaveBeenCalled();
  });

  it('emits exactly at threshold for route failures', async () => {
    const { client } = createCounterClient();
    const emitAlert = createEmitAlert();

    for (let i = 1; i <= CONFIG.agentFailureThreshold; i++) {
      await recordAgentFailure({
        kind: 'route_failure',
        route: '/api/agent/chat',
        orgId: 'org_123',
        statusCode: 500,
      }, makeDeps(client, { emitAlert }));
    }

    expect(emitAlert).toHaveBeenCalledTimes(1);
    expect(emitAlert.mock.calls[0]?.[0]).toMatchObject({
      category: 'agent_failure',
      level: 'error',
      tags: {
        route: '/api/agent/chat',
        tool: 'unknown',
      },
      extra: {
        kind: 'route_failure',
        orgId: 'org_123',
        statusCode: 500,
        threshold: CONFIG.agentFailureThreshold,
      },
    });
  });

  it('emits exactly at threshold for tool error results', async () => {
    const { client } = createCounterClient();
    const emitAlert = createEmitAlert();

    for (let i = 1; i <= CONFIG.agentFailureThreshold; i++) {
      await recordAgentFailure({
        kind: 'tool_result',
        route: '/api/agent',
        orgId: 'org_456',
        tool: 'send_reply',
        detail: 'Error: email dispatch failed',
      }, makeDeps(client, { emitAlert }));
    }

    expect(emitAlert).toHaveBeenCalledTimes(1);
    expect(emitAlert.mock.calls[0]?.[0]).toMatchObject({
      category: 'agent_failure',
      tags: {
        route: '/api/agent',
        tool: 'send_reply',
      },
      extra: {
        kind: 'tool_result',
        orgId: 'org_456',
        tool: 'send_reply',
      },
    });
  });

  it('uses unknown route and tool fallback when missing', async () => {
    const { client } = createCounterClient();
    const emitAlert = createEmitAlert();

    for (let i = 1; i <= CONFIG.agentFailureThreshold; i++) {
      await recordAgentFailure({
        kind: 'route_failure',
        orgId: null,
      }, makeDeps(client, { emitAlert }));
    }

    expect(emitAlert).toHaveBeenCalledTimes(1);
    expect(emitAlert.mock.calls[0]?.[0]).toMatchObject({
      tags: {
        route: 'unknown',
        tool: 'unknown',
      },
      extra: {
        orgId: 'unknown',
      },
    });
  });

  it('isolates counters by org and tool', async () => {
    const { client } = createCounterClient();
    const emitAlert = createEmitAlert();

    for (let i = 1; i < CONFIG.agentFailureThreshold; i++) {
      await recordAgentFailure({
        kind: 'tool_result',
        route: '/api/agent',
        orgId: 'org_a',
        tool: 'send_reply',
      }, makeDeps(client, { emitAlert }));
      await recordAgentFailure({
        kind: 'tool_result',
        route: '/api/agent',
        orgId: 'org_b',
        tool: 'send_email',
      }, makeDeps(client, { emitAlert }));
    }

    expect(emitAlert).not.toHaveBeenCalled();
  });
});

describe('recordAgentRouteFailure', () => {
  it('skips route alert plumbing in test runtime by default', async () => {
    const { client } = createCounterClient();
    const getCounterClient = vi.fn(() => client);

    const result = await recordAgentRouteFailure({
      route: '/api/agent',
      orgId: 'org_123',
      error: new Error('Agent execution requires an approved plan'),
    }, { getCounterClient });

    expect(result).toBeNull();
    expect(getCounterClient).not.toHaveBeenCalled();
  });

  it('allows route alert plumbing in tests when explicitly requested', async () => {
    const { client } = createCounterClient();
    const getCounterClient = vi.fn(() => client);

    const result = await recordAgentRouteFailure({
      route: '/api/agent',
      orgId: 'org_123',
      statusCode: 400,
      detail: 'Agent execution requires an approved plan',
    }, { getCounterClient, skipInTest: false });

    expect(result?.window.count).toBe(1);
    expect(getCounterClient).toHaveBeenCalledTimes(1);
  });
});

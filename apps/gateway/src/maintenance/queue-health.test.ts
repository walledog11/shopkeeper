import { describe, expect, it, vi } from 'vitest';
import type { GatewayOpsAlertConfig } from '../config/runtime-config.js';
import type { EmitOpsAlertResult, OpsAlertCounterClient } from '../ops-alerts.js';
import {
  checkGatewayQueueHealth,
  type QueueHealthActiveJob,
  type QueueHealthCheckDependencies,
  type QueueHealthInspectableQueue,
} from './queue-health.js';

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

describe('checkGatewayQueueHealth', () => {
  it('alerts once per threshold window for failed and waiting queue counts', async () => {
    const { client } = createCounterClient();
    const emitAlert = createEmitAlert();
    const inboundQueue = createQueue({ failed: 11, waiting: 101, active: 0 });
    const summaryQueue = createQueue({ failed: 12, waiting: 102, active: 0 });

    const first = await checkGatewayQueueHealth([
      { label: 'inbound', queueName: 'inbound-messages', queue: inboundQueue },
      { label: 'aiSummary', queueName: 'ai-summary', queue: summaryQueue },
    ], {
      counterClient: client,
      config: CONFIG,
      nowMs: 301_000,
      emitAlert,
    });

    const second = await checkGatewayQueueHealth([
      { label: 'inbound', queueName: 'inbound-messages', queue: inboundQueue },
      { label: 'aiSummary', queueName: 'ai-summary', queue: summaryQueue },
    ], {
      counterClient: client,
      config: CONFIG,
      nowMs: 301_000,
      emitAlert,
    });

    expect(first.alerts.map((alert) => `${alert.queue}:${alert.metric}:${alert.emitted}`)).toEqual([
      'inbound:failed:true',
      'inbound:waiting:true',
      'aiSummary:failed:true',
      'aiSummary:waiting:true',
    ]);
    expect(second.alerts.every((alert) => !alert.emitted)).toBe(true);
    expect(emitAlert).toHaveBeenCalledTimes(4);
    expect(inboundQueue.getJobs).not.toHaveBeenCalled();
    expect(summaryQueue.getJobs).not.toHaveBeenCalled();
  });

  it('stays quiet when queue counts and active job age are not above thresholds', async () => {
    const { client } = createCounterClient();
    const emitAlert = createEmitAlert();
    const queue = createQueue(
      { failed: 10, waiting: 100, active: 1 },
      [{ id: 'job-active', name: 'process-email', processedOn: 100_000, attemptsMade: 0 }],
    );

    const result = await checkGatewayQueueHealth([
      { label: 'inbound', queueName: 'inbound-messages', queue },
    ], {
      counterClient: client,
      config: CONFIG,
      nowMs: 1_000_000,
      emitAlert,
    });

    expect(result.alerts).toEqual([]);
    expect(emitAlert).not.toHaveBeenCalled();
  });

  it('samples active jobs with a bound and emits stuck-job metadata', async () => {
    const { client } = createCounterClient();
    const emitAlert = createEmitAlert();
    const queue = createQueue(
      { failed: 0, waiting: 0, active: 3 },
      [
        { id: 'job-recent', name: 'process-email', processedOn: 990_000, attemptsMade: 0 },
        {
          id: 'job-stuck',
          name: 'process-ig-dm',
          timestamp: 10_000,
          processedOn: 90_000,
          attemptsMade: 2,
          data: {
            platform: 'ig_dm',
            organizationId: 'org_123',
            traceId: 'trace_123',
          },
        },
        { id: 'job-outside-sample', name: 'process-email', processedOn: 1, attemptsMade: 0 },
      ],
    );

    const result = await checkGatewayQueueHealth([
      { label: 'inbound', queueName: 'inbound-messages', queue },
    ], {
      counterClient: client,
      config: CONFIG,
      nowMs: 1_000_000,
      activeSampleLimit: 2,
      emitAlert,
    });

    expect(queue.getJobs).toHaveBeenCalledWith(['active'], 0, 1, true);
    expect(result.snapshots[0]?.activeJobSampleSize).toBe(2);
    expect(result.alerts).toMatchObject([
      { queue: 'inbound', metric: 'active_stuck', value: 910_000, emitted: true },
    ]);

    const alertInput = emitAlert.mock.calls[0]?.[0];
    expect(alertInput).toMatchObject({
      category: 'queue_health',
      tags: {
        queue: 'inbound',
        platform: 'ig_dm',
        channel: 'ig_dm',
        orgId: 'org_123',
      },
      extra: {
        metric: 'active_stuck',
        queueName: 'inbound-messages',
        counts: { failed: 0, waiting: 0, active: 3 },
        oldestActiveJob: {
          id: 'job-stuck',
          name: 'process-ig-dm',
          attemptsMade: 2,
          ageMs: 910_000,
          platform: 'ig_dm',
          channel: 'ig_dm',
          organizationId: 'org_123',
          traceId: 'trace_123',
        },
      },
      fingerprint: [
        'ops-alert',
        'queue_health',
        'gateway',
        'queue:inbound',
        'metric:active_stuck',
        'channel:ig_dm',
      ],
    });

    const second = await checkGatewayQueueHealth([
      { label: 'inbound', queueName: 'inbound-messages', queue },
    ], {
      counterClient: client,
      config: CONFIG,
      nowMs: 1_000_000,
      activeSampleLimit: 2,
      emitAlert,
    });

    expect(second.alerts).toMatchObject([
      { queue: 'inbound', metric: 'active_stuck', emitted: false },
    ]);
    expect(emitAlert).toHaveBeenCalledTimes(1);
  });
});

function createQueue(
  counts: Record<string, number>,
  activeJobs: QueueHealthActiveJob[] = [],
): QueueHealthInspectableQueue & { getJobs: ReturnType<typeof vi.fn> } {
  return {
    getJobCounts: vi.fn(async () => counts),
    getJobs: vi.fn(async (_types: Array<'active'>, start: number, end: number) =>
      activeJobs.slice(start, end + 1),
    ),
  };
}

function createEmitAlert() {
  return vi.fn<NonNullable<QueueHealthCheckDependencies['emitAlert']>>(() => LOG_ONLY_RESULT);
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
      expire: async () => undefined,
    },
  };
}

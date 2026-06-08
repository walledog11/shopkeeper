import { getGatewayOpsAlertConfig, type GatewayOpsAlertConfig } from '../config/runtime-config.js';
import { JOB, QUEUE } from '../constants.js';
import {
  emitOpsAlert,
  incrementOpsAlertWindow,
  type IncrementOpsAlertWindowResult,
  type OpsAlertCounterClient,
} from '../ops-alerts.js';
import {
  createMaintenanceQueue,
  createMaintenanceWorker,
  FIVE_MINUTES_MS,
  scheduleRepeatableJob,
  type MaintenanceJobRegistration,
} from './registration.js';

export const QUEUE_HEALTH_ACTIVE_SAMPLE_LIMIT = 20;

type QueueHealthQueueLabel = 'inbound' | 'aiSummary';
type QueueHealthMetric = 'failed' | 'waiting' | 'active_stuck';

export interface QueueHealthCounts {
  waiting: number;
  active: number;
  failed: number;
  [key: string]: number;
}

export interface QueueHealthActiveJob {
  id?: string | number;
  name?: string;
  attemptsMade?: number;
  timestamp?: number;
  processedOn?: number;
  data?: unknown;
}

export interface QueueHealthActiveJobSnapshot {
  id: string | null;
  name: string | null;
  attemptsMade: number | null;
  ageMs: number;
  startedAt: string;
  timestamp: string | null;
  processedOn: string | null;
  platform: string | null;
  channel: string | null;
  organizationId: string | null;
  traceId: string | null;
}

export interface QueueHealthInspectableQueue {
  getJobCounts: (...types: Array<'waiting' | 'active' | 'failed'>) => Promise<Record<string, number | undefined>>;
  getJobs: (
    types: Array<'active'>,
    start: number,
    end: number,
    asc: boolean,
  ) => Promise<QueueHealthActiveJob[]>;
}

export interface QueueHealthMonitoredQueue {
  label: QueueHealthQueueLabel;
  queueName: string;
  queue: QueueHealthInspectableQueue;
}

export interface QueueHealthSnapshot {
  label: QueueHealthQueueLabel;
  queueName: string;
  counts: QueueHealthCounts;
  activeJobSampleSize: number;
  oldestActiveJob: QueueHealthActiveJobSnapshot | null;
}

export interface QueueHealthAlertDecision {
  queue: QueueHealthQueueLabel;
  metric: QueueHealthMetric;
  value: number;
  threshold: number;
  emitted: boolean;
  window: IncrementOpsAlertWindowResult;
}

export interface QueueHealthCheckResult {
  snapshots: QueueHealthSnapshot[];
  alerts: QueueHealthAlertDecision[];
}

export interface QueueHealthCheckDependencies {
  counterClient: OpsAlertCounterClient;
  config?: GatewayOpsAlertConfig;
  nowMs?: number;
  activeSampleLimit?: number;
  emitAlert?: typeof emitOpsAlert;
  incrementWindow?: typeof incrementOpsAlertWindow;
}

export async function checkGatewayQueueHealth(
  monitoredQueues: QueueHealthMonitoredQueue[],
  dependencies: QueueHealthCheckDependencies,
): Promise<QueueHealthCheckResult> {
  const config = dependencies.config ?? getGatewayOpsAlertConfig();
  const nowMs = dependencies.nowMs ?? Date.now();
  const activeSampleLimit = normalizeSampleLimit(dependencies.activeSampleLimit);
  const emitAlert = dependencies.emitAlert ?? emitOpsAlert;
  const incrementWindow = dependencies.incrementWindow ?? incrementOpsAlertWindow;

  const snapshots = await Promise.all(
    monitoredQueues.map((monitoredQueue) =>
      readQueueHealthSnapshot(monitoredQueue, { nowMs, activeSampleLimit }),
    ),
  );

  const alerts: QueueHealthAlertDecision[] = [];
  for (const snapshot of snapshots) {
    if (snapshot.counts.failed > config.queueFailedThreshold) {
      alerts.push(await emitQueueHealthAlert({
        snapshot,
        metric: 'failed',
        value: snapshot.counts.failed,
        threshold: config.queueFailedThreshold,
        config,
        nowMs,
        counterClient: dependencies.counterClient,
        emitAlert,
        incrementWindow,
      }));
    }

    if (snapshot.counts.waiting > config.queueWaitingThreshold) {
      alerts.push(await emitQueueHealthAlert({
        snapshot,
        metric: 'waiting',
        value: snapshot.counts.waiting,
        threshold: config.queueWaitingThreshold,
        config,
        nowMs,
        counterClient: dependencies.counterClient,
        emitAlert,
        incrementWindow,
      }));
    }

    if (
      snapshot.oldestActiveJob
      && snapshot.oldestActiveJob.ageMs > config.queueActiveStuckMs
    ) {
      alerts.push(await emitQueueHealthAlert({
        snapshot,
        metric: 'active_stuck',
        value: snapshot.oldestActiveJob.ageMs,
        threshold: config.queueActiveStuckMs,
        config,
        nowMs,
        counterClient: dependencies.counterClient,
        emitAlert,
        incrementWindow,
      }));
    }
  }

  return { snapshots, alerts };
}

export const registerQueueHealthMaintenanceJob: MaintenanceJobRegistration = async (context) => {
  const queueHealthQueue = createMaintenanceQueue(context, QUEUE.QUEUE_HEALTH);
  const inboundQueue = createMaintenanceQueue(context, QUEUE.INBOUND);
  const summaryQueue = createMaintenanceQueue(context, QUEUE.AI_SUMMARY);

  await scheduleRepeatableJob(queueHealthQueue, JOB.QUEUE_HEALTH_CHECK, JOB.QUEUE_HEALTH_ID, FIVE_MINUTES_MS);

  const worker = createMaintenanceWorker(context, QUEUE.QUEUE_HEALTH, async () => {
    await checkGatewayQueueHealth([
      { label: 'inbound', queueName: QUEUE.INBOUND, queue: inboundQueue },
      { label: 'aiSummary', queueName: QUEUE.AI_SUMMARY, queue: summaryQueue },
    ], {
      counterClient: context.producerConn,
    });
  }, {
    label: 'QueueHealth',
    failureQueue: 'queue-health',
  });

  return {
    workers: [worker],
    queues: [queueHealthQueue, inboundQueue, summaryQueue],
  };
};

export async function readQueueHealthSnapshot(
  monitoredQueue: QueueHealthMonitoredQueue,
  options: { nowMs: number; activeSampleLimit?: number },
): Promise<QueueHealthSnapshot> {
  const activeSampleLimit = normalizeSampleLimit(options.activeSampleLimit);
  const rawCounts = await monitoredQueue.queue.getJobCounts('waiting', 'active', 'failed');
  const counts = normalizeQueueCounts(rawCounts);
  const activeJobs = counts.active > 0
    ? await monitoredQueue.queue.getJobs(['active'], 0, activeSampleLimit - 1, true)
    : [];

  return {
    label: monitoredQueue.label,
    queueName: monitoredQueue.queueName,
    counts,
    activeJobSampleSize: activeJobs.length,
    oldestActiveJob: getOldestActiveJobSnapshot(activeJobs, options.nowMs),
  };
}

export function getOldestActiveJobSnapshot(
  activeJobs: QueueHealthActiveJob[],
  nowMs: number,
): QueueHealthActiveJobSnapshot | null {
  let oldest: QueueHealthActiveJobSnapshot | null = null;

  for (const job of activeJobs) {
    const startedAtMs = readTimestampMs(job.processedOn) ?? readTimestampMs(job.timestamp);
    if (startedAtMs === null) continue;

    const data = isRecord(job.data) ? job.data : {};
    const platform = readString(data.platform);
    const channel = readString(data.channelType) ?? platform;
    const snapshot: QueueHealthActiveJobSnapshot = {
      id: job.id === undefined ? null : String(job.id),
      name: readString(job.name),
      attemptsMade: Number.isInteger(job.attemptsMade) ? job.attemptsMade! : null,
      ageMs: Math.max(0, nowMs - startedAtMs),
      startedAt: new Date(startedAtMs).toISOString(),
      timestamp: formatTimestamp(job.timestamp),
      processedOn: formatTimestamp(job.processedOn),
      platform,
      channel,
      organizationId: readString(data.organizationId),
      traceId: readString(data.traceId),
    };

    if (!oldest || snapshot.ageMs > oldest.ageMs) {
      oldest = snapshot;
    }
  }

  return oldest;
}

async function emitQueueHealthAlert(input: {
  snapshot: QueueHealthSnapshot;
  metric: QueueHealthMetric;
  value: number;
  threshold: number;
  config: GatewayOpsAlertConfig;
  nowMs: number;
  counterClient: OpsAlertCounterClient;
  emitAlert: typeof emitOpsAlert;
  incrementWindow: typeof incrementOpsAlertWindow;
}): Promise<QueueHealthAlertDecision> {
  const window = await input.incrementWindow(input.counterClient, {
    keyParts: ['queue_health', input.snapshot.label, input.metric],
    threshold: 1,
    windowSecs: input.config.windowSecs,
    nowMs: input.nowMs,
  });

  if (window.thresholdCrossed) {
    const oldestActiveJob = input.snapshot.oldestActiveJob;
    const activeJobTags = input.metric === 'active_stuck'
      ? {
          platform: oldestActiveJob?.platform,
          channel: oldestActiveJob?.channel,
          orgId: oldestActiveJob?.organizationId,
        }
      : {};

    input.emitAlert({
      category: 'queue_health',
      message: formatQueueHealthAlertMessage(input.metric, input.snapshot.label, input.value, input.threshold),
      level: 'warning',
      tags: {
        queue: input.snapshot.label,
        ...activeJobTags,
      },
      fingerprint: buildQueueHealthFingerprint(
        input.snapshot.label,
        input.metric,
        oldestActiveJob?.channel,
      ),
      extra: {
        metric: input.metric,
        queue: input.snapshot.label,
        queueName: input.snapshot.queueName,
        value: input.value,
        threshold: input.threshold,
        counts: input.snapshot.counts,
        activeJobSampleSize: input.snapshot.activeJobSampleSize,
        oldestActiveJob,
        alertWindow: window,
      },
    }, { config: input.config });
  }

  return {
    queue: input.snapshot.label,
    metric: input.metric,
    value: input.value,
    threshold: input.threshold,
    emitted: window.thresholdCrossed,
    window,
  };
}

function formatQueueHealthAlertMessage(
  metric: QueueHealthMetric,
  queue: QueueHealthQueueLabel,
  value: number,
  threshold: number,
): string {
  if (metric === 'active_stuck') {
    return `Queue alert: ${queue} active job age (${value}ms) exceeded threshold (${threshold}ms)`;
  }

  const metricLabel = metric === 'failed' ? 'failed jobs' : 'waiting jobs';
  return `Queue alert: ${queue} ${metricLabel} (${value}) exceeded threshold (${threshold})`;
}

function buildQueueHealthFingerprint(
  queue: QueueHealthQueueLabel,
  metric: QueueHealthMetric,
  channel: string | null | undefined,
): string[] {
  const fingerprint = ['ops-alert', 'queue_health', 'gateway', `queue:${queue}`, `metric:${metric}`];
  if (metric === 'active_stuck' && channel) {
    fingerprint.push(`channel:${channel}`);
  }
  return fingerprint;
}

function normalizeQueueCounts(rawCounts: Record<string, number | undefined>): QueueHealthCounts {
  const counts: QueueHealthCounts = {
    waiting: 0,
    active: 0,
    failed: 0,
  };

  for (const [key, value] of Object.entries(rawCounts)) {
    counts[key] = normalizeCount(value);
  }

  return counts;
}

function normalizeCount(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.floor(value);
}

function normalizeSampleLimit(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return QUEUE_HEALTH_ACTIVE_SAMPLE_LIMIT;
  }
  return Math.max(1, Math.floor(value));
}

function readTimestampMs(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return value;
}

function formatTimestamp(value: unknown): string | null {
  const timestampMs = readTimestampMs(value);
  return timestampMs === null ? null : new Date(timestampMs).toISOString();
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

import { getGatewayOpsAlertConfig, type GatewayOpsAlertConfig } from '../config/runtime-config.js';
import { JOB, QUEUE } from '../constants.js';
import { isRecord, readString } from '../lib/typing.js';
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

const QUEUE_HEALTH_ACTIVE_SAMPLE_LIMIT = 20;

type QueueHealthQueueLabel =
  | 'inbound'
  | 'aiSummary'
  | 'outboundEmail'
  | 'gmailSync'
  | 'orderReview'
  | 'operatorEvent';
type QueueHealthMetric = 'failed' | 'waiting' | 'active_stuck';

// Per-queue SLO overrides. Any omitted metric falls back to the global
// GatewayOpsAlertConfig threshold. `failed` counts the retained failed set over
// the 7-day removeOnFail window, not "failures right now", so keep it coarse and
// put tight customer-latency SLOs on waiting/active_stuck.
export interface QueueHealthThresholds {
  failed?: number;
  waiting?: number;
  activeStuckMs?: number;
}

type QueueHealthJobCounts = {
  waiting: number;
  active: number;
  failed: number;
  [key: string]: number;
};

type ActiveJobSnapshot = {
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
};

export interface QueueHealthActiveJob {
  id?: string | number;
  name?: string;
  attemptsMade?: number;
  timestamp?: number;
  processedOn?: number;
  data?: unknown;
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
  thresholds?: QueueHealthThresholds;
}

export interface QueueHealthSnapshot {
  label: QueueHealthQueueLabel;
  queueName: string;
  counts: QueueHealthJobCounts;
  activeJobSampleSize: number;
  oldestActiveJob: ActiveJobSnapshot | null;
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

  const monitored = await Promise.all(
    monitoredQueues.map(async (monitoredQueue) => ({
      monitoredQueue,
      snapshot: await readQueueHealthSnapshot(monitoredQueue, { nowMs, activeSampleLimit }),
    })),
  );

  const alerts: QueueHealthAlertDecision[] = [];
  for (const { monitoredQueue, snapshot } of monitored) {
    const failedThreshold = monitoredQueue.thresholds?.failed ?? config.queueFailedThreshold;
    const waitingThreshold = monitoredQueue.thresholds?.waiting ?? config.queueWaitingThreshold;
    const activeStuckMs = monitoredQueue.thresholds?.activeStuckMs ?? config.queueActiveStuckMs;

    if (snapshot.counts.failed > failedThreshold) {
      alerts.push(await emitQueueHealthAlert({
        snapshot,
        metric: 'failed',
        value: snapshot.counts.failed,
        threshold: failedThreshold,
        config,
        nowMs,
        counterClient: dependencies.counterClient,
        emitAlert,
        incrementWindow,
      }));
    }

    if (snapshot.counts.waiting > waitingThreshold) {
      alerts.push(await emitQueueHealthAlert({
        snapshot,
        metric: 'waiting',
        value: snapshot.counts.waiting,
        threshold: waitingThreshold,
        config,
        nowMs,
        counterClient: dependencies.counterClient,
        emitAlert,
        incrementWindow,
      }));
    }

    if (
      snapshot.oldestActiveJob
      && snapshot.oldestActiveJob.ageMs > activeStuckMs
    ) {
      alerts.push(await emitQueueHealthAlert({
        snapshot,
        metric: 'active_stuck',
        value: snapshot.oldestActiveJob.ageMs,
        threshold: activeStuckMs,
        config,
        nowMs,
        counterClient: dependencies.counterClient,
        emitAlert,
        incrementWindow,
      }));
    }
  }

  return { snapshots: monitored.map((entry) => entry.snapshot), alerts };
}

// Customer- and merchant-facing queues carry a tight waiting SLO: a real backlog
// here is a small number of undelivered replies or unprocessed merchant
// instructions, well below the default 100. outbound-email also gets a tight
// active_stuck bound since a send is a single deadline-bounded provider call.
// gmail-sync (long history pagination) and operator-event active_stuck (already
// backstopped by the P4-03 sweep at 10min) stay on the loose global default,
// and `failed` stays global everywhere (it's cumulative over the 7-day window).
const OUTBOUND_EMAIL_THRESHOLDS: QueueHealthThresholds = { waiting: 20, activeStuckMs: 300_000 };
const OPERATOR_EVENT_THRESHOLDS: QueueHealthThresholds = { waiting: 20 };

export const registerQueueHealthMaintenanceJob: MaintenanceJobRegistration = async (context) => {
  const queueHealthQueue = createMaintenanceQueue(context, QUEUE.QUEUE_HEALTH);
  const inboundQueue = createMaintenanceQueue(context, QUEUE.INBOUND);
  const summaryQueue = createMaintenanceQueue(context, QUEUE.AI_SUMMARY);
  const outboundEmailQueue = createMaintenanceQueue(context, QUEUE.OUTBOUND_EMAIL);
  const gmailSyncQueue = createMaintenanceQueue(context, QUEUE.GMAIL_SYNC);
  const orderReviewQueue = createMaintenanceQueue(context, QUEUE.ORDER_REVIEW);
  const operatorEventQueue = createMaintenanceQueue(context, QUEUE.OPERATOR_EVENT);

  await scheduleRepeatableJob(queueHealthQueue, JOB.QUEUE_HEALTH_CHECK, JOB.QUEUE_HEALTH_ID, FIVE_MINUTES_MS);

  const worker = createMaintenanceWorker(context, QUEUE.QUEUE_HEALTH, async () => {
    await checkGatewayQueueHealth([
      { label: 'inbound', queueName: QUEUE.INBOUND, queue: inboundQueue },
      { label: 'aiSummary', queueName: QUEUE.AI_SUMMARY, queue: summaryQueue },
      {
        label: 'outboundEmail',
        queueName: QUEUE.OUTBOUND_EMAIL,
        queue: outboundEmailQueue,
        thresholds: OUTBOUND_EMAIL_THRESHOLDS,
      },
      { label: 'gmailSync', queueName: QUEUE.GMAIL_SYNC, queue: gmailSyncQueue },
      { label: 'orderReview', queueName: QUEUE.ORDER_REVIEW, queue: orderReviewQueue },
      {
        label: 'operatorEvent',
        queueName: QUEUE.OPERATOR_EVENT,
        queue: operatorEventQueue,
        thresholds: OPERATOR_EVENT_THRESHOLDS,
      },
    ], {
      counterClient: context.producerConn,
    });
  }, {
    label: 'QueueHealth',
    failureQueue: 'queue-health',
  });

  return {
    workers: [worker],
    queues: [
      queueHealthQueue,
      inboundQueue,
      summaryQueue,
      outboundEmailQueue,
      gmailSyncQueue,
      orderReviewQueue,
      operatorEventQueue,
    ],
  };
};

async function readQueueHealthSnapshot(
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

function getOldestActiveJobSnapshot(
  activeJobs: QueueHealthActiveJob[],
  nowMs: number,
): ActiveJobSnapshot | null {
  let oldest: ActiveJobSnapshot | null = null;

  for (const job of activeJobs) {
    const startedAtMs = readTimestampMs(job.processedOn) ?? readTimestampMs(job.timestamp);
    if (startedAtMs === null) continue;

    const data = isRecord(job.data) ? job.data : {};
    const platform = readString(data.platform);
    const channel = readString(data.channelType) ?? platform;
    const snapshot: ActiveJobSnapshot = {
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

function normalizeQueueCounts(rawCounts: Record<string, number | undefined>): QueueHealthJobCounts {
  const counts: QueueHealthJobCounts = {
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


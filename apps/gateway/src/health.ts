import type { Redis as IORedis } from 'ioredis';
import { Queue } from 'bullmq';
import { QUEUE } from './constants.js';
import { getGatewayWorkerRedisConfig } from './config/runtime-config.js';
import { toGatewayBullMqConnection } from './clients/redis-client.js';

export const WORKER_HEARTBEAT_KEY = 'health:gateway-worker:heartbeat';
export const FAILED_QUEUE_JOB_SAMPLE_LIMIT = 5;

export interface FailedQueueJobSnapshot {
  id: string | null;
  name: string | null;
  failedReason: string | null;
  attemptsMade: number | null;
  finishedOn: string | null;
  threadId: string | null;
  organizationId: string | null;
  traceId: string | null;
}

interface FailedQueueJobRecord {
  id?: string | number;
  name?: string;
  failedReason?: string;
  attemptsMade?: number;
  finishedOn?: number;
  data?: unknown;
}

let cachedQueueDiagnostics:
  | { expiresAt: number; value: Record<string, unknown> }
  | null = null;
let queueDiagnosticsPromise: Promise<Record<string, unknown>> | null = null;

export function clearQueueDiagnosticsCache(): void {
  cachedQueueDiagnostics = null;
  queueDiagnosticsPromise = null;
}

export interface WorkerHeartbeatPayload {
  timestamp: string;
  pid: number;
}

export async function writeWorkerHeartbeat(redis: IORedis): Promise<void> {
  const { heartbeatTtlSecs } = getGatewayWorkerRedisConfig();
  const payload: WorkerHeartbeatPayload = {
    timestamp: new Date().toISOString(),
    pid: process.pid,
  };

  await redis.set(
    WORKER_HEARTBEAT_KEY,
    JSON.stringify(payload),
    'EX',
    heartbeatTtlSecs,
  );
}

export async function readWorkerHeartbeat(redis: IORedis): Promise<{
  healthy: boolean;
  ageMs: number | null;
  payload: WorkerHeartbeatPayload | null;
}> {
  const { heartbeatStaleMs } = getGatewayWorkerRedisConfig();
  const raw = await redis.get(WORKER_HEARTBEAT_KEY);
  if (!raw) {
    return { healthy: false, ageMs: null, payload: null };
  }

  try {
    const payload = JSON.parse(raw) as WorkerHeartbeatPayload;
    const ageMs = Date.now() - new Date(payload.timestamp).getTime();
    return {
      healthy: ageMs <= heartbeatStaleMs,
      ageMs,
      payload,
    };
  } catch {
    return { healthy: false, ageMs: null, payload: null };
  }
}

export async function getQueueDiagnostics(redis: IORedis): Promise<Record<string, unknown>> {
  const now = Date.now();
  if (cachedQueueDiagnostics && cachedQueueDiagnostics.expiresAt > now) {
    return cachedQueueDiagnostics.value;
  }

  if (queueDiagnosticsPromise) {
    return queueDiagnosticsPromise;
  }

  queueDiagnosticsPromise = (async () => {
    const { queueDiagnosticsCacheMs } = getGatewayWorkerRedisConfig();
    const connection = toGatewayBullMqConnection(redis);
    const inboundQueue = new Queue(QUEUE.INBOUND, { connection });
    const summaryQueue = new Queue(QUEUE.AI_SUMMARY, { connection });

    try {
      const [inboundCounts, summaryCounts] = await Promise.all([
        inboundQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed', 'paused'),
        summaryQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed', 'paused'),
      ]);

      const [inboundFailedJobs, aiSummaryFailedJobs] = await Promise.all([
        readFailedQueueJobSnapshots(inboundQueue, inboundCounts.failed ?? 0),
        readFailedQueueJobSnapshots(summaryQueue, summaryCounts.failed ?? 0),
      ]);

      const diagnostics = {
        inbound: {
          ...inboundCounts,
          ...(inboundFailedJobs.length > 0 ? { failedJobs: inboundFailedJobs } : {}),
        },
        aiSummary: {
          ...summaryCounts,
          ...(aiSummaryFailedJobs.length > 0 ? { failedJobs: aiSummaryFailedJobs } : {}),
        },
      };

      cachedQueueDiagnostics = {
        value: diagnostics,
        expiresAt: now + queueDiagnosticsCacheMs,
      };

      return diagnostics;
    } finally {
      await Promise.all([inboundQueue.close(), summaryQueue.close()]);
    }
  })();

  try {
    return await queueDiagnosticsPromise;
  } finally {
    queueDiagnosticsPromise = null;
  }
}

export async function readFailedQueueJobSnapshots(
  queue: { getJobs: (types: Array<'failed'>, start: number, end: number, asc: boolean) => Promise<FailedQueueJobRecord[]> },
  failedCount: number,
  sampleLimit = FAILED_QUEUE_JOB_SAMPLE_LIMIT,
): Promise<FailedQueueJobSnapshot[]> {
  if (!Number.isFinite(failedCount) || failedCount <= 0) {
    return [];
  }

  const limit = Math.max(1, Math.min(Math.floor(sampleLimit), failedCount));
  const jobs = await queue.getJobs(['failed'], 0, limit - 1, false);

  return jobs.map((job) => {
    const data = isRecord(job.data) ? job.data : {};
    return {
      id: job.id === undefined ? null : String(job.id),
      name: readOptionalString(job.name),
      failedReason: readOptionalString(job.failedReason),
      attemptsMade: Number.isInteger(job.attemptsMade) ? job.attemptsMade! : null,
      finishedOn: formatTimestamp(job.finishedOn),
      threadId: readOptionalString(data.threadId),
      organizationId: readOptionalString(data.organizationId),
      traceId: readOptionalString(data.traceId),
    };
  });
}

function readOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function formatTimestamp(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return new Date(value).toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

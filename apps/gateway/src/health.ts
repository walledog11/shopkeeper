import type { Application } from 'express';
import type { Redis as IORedis } from 'ioredis';
import { db } from '@shopkeeper/db';
import { QUEUE } from './constants.js';
import { getGatewayBullMqQueue } from './clients/gateway-queues.js';
import { getGatewayWorkerRedisConfig } from './config/runtime-config.js';
import { isImessageConfigured } from './clients/spectrum.js';
import { authorizeInternalRequest } from './routes/internal-auth.js';
import logger from './logger.js';
import { isRecord } from './lib/typing.js';

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

export async function getQueueDiagnostics(): Promise<Record<string, unknown>> {
  const now = Date.now();
  if (cachedQueueDiagnostics && cachedQueueDiagnostics.expiresAt > now) {
    return cachedQueueDiagnostics.value;
  }

  if (queueDiagnosticsPromise) {
    return queueDiagnosticsPromise;
  }

  queueDiagnosticsPromise = (async () => {
    const { queueDiagnosticsCacheMs } = getGatewayWorkerRedisConfig();
    const inboundQueue = getGatewayBullMqQueue(QUEUE.INBOUND);
    const summaryQueue = getGatewayBullMqQueue(QUEUE.AI_SUMMARY);

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
  })();

  try {
    return await queueDiagnosticsPromise;
  } finally {
    queueDiagnosticsPromise = null;
  }
}

export interface HealthRouteDependencies {
  redis: IORedis;
}

export function registerHealthRoutes(app: Application, { redis }: HealthRouteDependencies): void {
  // Public liveness probe. Reports coarse per-check status only — no queue
  // counts, worker PID/timestamp, or failed-job tenant identifiers (AUD-017).
  // Detailed diagnostics are served behind auth on /health/queues.
  app.get('/health/deep', async (_req, res) => {
    const checks: Record<string, unknown> = {};
    let ok = true;

    try {
      await db.$queryRaw`SELECT 1`;
      checks.db = { status: 'ok' };
    } catch (err) {
      checks.db = { status: 'error' };
      ok = false;
      logger.error({ err }, '[Health] DB check failed');
    }

    try {
      const pong = await redis.ping();
      checks.redis = { status: pong === 'PONG' ? 'ok' : 'error' };
      if (pong !== 'PONG') ok = false;
    } catch (err) {
      checks.redis = { status: 'error' };
      ok = false;
      logger.error({ err }, '[Health] Redis check failed');
    }

    try {
      const heartbeat = await readWorkerHeartbeat(redis);
      checks.worker = { status: heartbeat.healthy ? 'ok' : 'error' };
      if (!heartbeat.healthy) ok = false;
    } catch (err) {
      checks.worker = { status: 'error' };
      ok = false;
      logger.error({ err }, '[Health] Worker heartbeat check failed');
    }

    try {
      await getQueueDiagnostics();
      checks.queues = { status: 'ok' };
    } catch (err) {
      checks.queues = { status: 'error' };
      ok = false;
      logger.error({ err }, '[Health] Queue diagnostics failed');
    }

    checks.imessage = {
      configured: isImessageConfigured(),
    };

    res.status(ok ? 200 : 503).json({ status: ok ? 'ok' : 'degraded', checks });
  });

  // Detailed queue + worker diagnostics: exposes queue counts and failed-job
  // metadata (thread/org identifiers), so require the internal secret.
  app.get('/health/queues', async (req, res) => {
    if (!authorizeInternalRequest(req, res, 'HealthQueues')) return;

    try {
      const heartbeat = await readWorkerHeartbeat(redis);
      const queueCounts = await getQueueDiagnostics();

      res.status(200).json({
        worker: {
          healthy: heartbeat.healthy,
          ageMs: heartbeat.ageMs,
          pid: heartbeat.payload?.pid ?? null,
          timestamp: heartbeat.payload?.timestamp ?? null,
        },
        queues: queueCounts,
      });
    } catch (err) {
      logger.error({ err }, '[Health] Queue diagnostics endpoint failed');
      res.status(503).json({ error: 'Failed to read queue diagnostics' });
    }
  });
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


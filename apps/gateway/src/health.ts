import type { Redis as IORedis } from 'ioredis';
import { Queue } from 'bullmq';
import { QUEUE } from './constants.js';
import { getGatewayWorkerRedisConfig } from './config/runtime-config.js';

export const WORKER_HEARTBEAT_KEY = 'health:gateway-worker:heartbeat';

let cachedQueueDiagnostics:
  | { expiresAt: number; value: Record<string, unknown> }
  | null = null;
let queueDiagnosticsPromise: Promise<Record<string, unknown>> | null = null;

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
    const connection = redis as unknown as Record<string, unknown>;
    const inboundQueue = new Queue(QUEUE.INBOUND, { connection });
    const summaryQueue = new Queue(QUEUE.AI_SUMMARY, { connection });

    try {
      const [inboundCounts, summaryCounts] = await Promise.all([
        inboundQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed', 'paused'),
        summaryQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed', 'paused'),
      ]);

      const diagnostics = {
        inbound: inboundCounts,
        aiSummary: summaryCounts,
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

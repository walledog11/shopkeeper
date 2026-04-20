import { Queue } from 'bullmq';
import { QUEUE } from './constants.js';
import { getGatewayWorkerRedisConfig } from './runtime-config.js';
export const WORKER_HEARTBEAT_KEY = 'health:gateway-worker:heartbeat';
let cachedQueueDiagnostics = null;
let queueDiagnosticsPromise = null;
export async function writeWorkerHeartbeat(redis) {
    const { heartbeatTtlSecs } = getGatewayWorkerRedisConfig();
    const payload = {
        timestamp: new Date().toISOString(),
        pid: process.pid,
    };
    await redis.set(WORKER_HEARTBEAT_KEY, JSON.stringify(payload), 'EX', heartbeatTtlSecs);
}
export async function readWorkerHeartbeat(redis) {
    const { heartbeatStaleMs } = getGatewayWorkerRedisConfig();
    const raw = await redis.get(WORKER_HEARTBEAT_KEY);
    if (!raw) {
        return { healthy: false, ageMs: null, payload: null };
    }
    try {
        const payload = JSON.parse(raw);
        const ageMs = Date.now() - new Date(payload.timestamp).getTime();
        return {
            healthy: ageMs <= heartbeatStaleMs,
            ageMs,
            payload,
        };
    }
    catch {
        return { healthy: false, ageMs: null, payload: null };
    }
}
export async function getQueueDiagnostics(redis) {
    const now = Date.now();
    if (cachedQueueDiagnostics && cachedQueueDiagnostics.expiresAt > now) {
        return cachedQueueDiagnostics.value;
    }
    if (queueDiagnosticsPromise) {
        return queueDiagnosticsPromise;
    }
    queueDiagnosticsPromise = (async () => {
        const { queueDiagnosticsCacheMs } = getGatewayWorkerRedisConfig();
        const connection = redis;
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
        }
        finally {
            await Promise.all([inboundQueue.close(), summaryQueue.close()]);
        }
    })();
    try {
        return await queueDiagnosticsPromise;
    }
    finally {
        queueDiagnosticsPromise = null;
    }
}

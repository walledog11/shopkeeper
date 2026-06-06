import type { Redis as IORedis } from 'ioredis';
import { writeWorkerHeartbeat } from '../health.js';
import logger from '../logger.js';
import type { GatewayHeartbeatResource } from './resources.js';

export async function createWorkerHeartbeatResource(
  redis: IORedis,
  heartbeatIntervalMs: number,
): Promise<GatewayHeartbeatResource> {
  const writeHeartbeat = async (logMessage: string) => {
    await writeWorkerHeartbeat(redis).catch((err) => {
      logger.error({ err: err instanceof Error ? err.message : String(err) }, logMessage);
    });
  };

  const heartbeatTimer = setInterval(() => {
    void writeHeartbeat('[Worker] Failed to write heartbeat');
  }, heartbeatIntervalMs);
  heartbeatTimer.unref();

  await writeHeartbeat('[Worker] Failed to write startup heartbeat');

  return {
    stop: () => clearInterval(heartbeatTimer),
  };
}

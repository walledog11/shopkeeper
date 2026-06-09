import { db } from '@shopkeeper/db';
import logger from './logger.js';
import { validateGatewayEnv } from './config/env.js';
import { createMaintenanceWorkers } from './maintenance/workers.js';
import { getGatewayWorkerRedisConfig } from './config/runtime-config.js';
import {
  closeGatewayRedisConnections,
  getGatewayBullMqProducerConnection,
  getGatewayBullMqWorkerConnection,
} from './clients/redis-client.js';
import { runGatewayEntry } from './bootstrap.js';
import { createCoreWorkerResources } from './workers/core.js';
import { createWorkerHeartbeatResource } from './workers/heartbeat.js';
import {
  createGatewayWorkerShutdown,
  mergeGatewayWorkerResources,
  registerGatewayShutdownSignals,
} from './workers/resources.js';

export async function startWorkerRuntime() {
  validateGatewayEnv();

  const workerRedisConfig = getGatewayWorkerRedisConfig();

  const sharedProducerConn = getGatewayBullMqProducerConnection();
  const sharedWorkerConn = getGatewayBullMqWorkerConnection();

  const workerOptions = {
    connection: sharedWorkerConn,
    drainDelay: workerRedisConfig.drainDelaySeconds,
    stalledInterval: workerRedisConfig.stalledIntervalMs,
  };

  const heartbeat = await createWorkerHeartbeatResource(
    sharedProducerConn,
    workerRedisConfig.heartbeatIntervalMs,
  );
  const coreResources = createCoreWorkerResources(sharedProducerConn, workerOptions);

  const { workers: maintenanceWorkers, queues: maintenanceQueues } = workerRedisConfig.maintenanceWorkersEnabled
    ? await createMaintenanceWorkers(sharedWorkerConn, sharedProducerConn, workerOptions)
    : { workers: [], queues: [] };

  const resources = mergeGatewayWorkerResources(coreResources, {
    workers: maintenanceWorkers,
    queues: maintenanceQueues,
    heartbeats: [heartbeat],
    shutdownResources: [
      {
        label: 'redis-connections',
        close: async () => {
          await closeGatewayRedisConnections();
        },
      },
      {
        label: 'database',
        close: async () => {
          await db.$disconnect().catch(() => {});
        },
      },
    ],
  });
  const shutdown = createGatewayWorkerShutdown(resources);
  registerGatewayShutdownSignals(shutdown);

  logger.info('[Worker] Engine started. Listening for incoming messages...');

  return {
    messageWorker: coreResources.messageWorker,
    aiSummaryWorker: coreResources.aiSummaryWorker,
    aiSummaryQueue: coreResources.aiSummaryQueue,
    maintenanceWorkers,
    maintenanceQueues,
    shutdown,
  };
}

await runGatewayEntry(import.meta.url, '[Worker] Failed startup env validation', startWorkerRuntime);

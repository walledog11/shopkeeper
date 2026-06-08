import { db } from '@shopkeeper/db';
import * as Sentry from '@sentry/node';
import logger from './logger.js';
import { validateGatewayEnv } from './config/env.js';
import { createMaintenanceWorkers } from './maintenance/workers.js';
import { getGatewayWorkerRedisConfig } from './config/runtime-config.js';
import { createGatewayBullMqConnection } from './clients/redis-client.js';
import { runGatewayEntry } from './bootstrap.js';
import { resolveSentryRelease } from '@shopkeeper/agent/observability';
import { sentryBeforeSend } from './observability/sentry.js';
import { createCoreWorkerResources } from './workers/core.js';
import { createWorkerHeartbeatResource } from './workers/heartbeat.js';
import {
  createGatewayWorkerShutdown,
  mergeGatewayWorkerResources,
  registerGatewayShutdownSignals,
} from './workers/resources.js';

export async function startWorkerRuntime() {
  validateGatewayEnv();

  if (process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'production',
      release: resolveSentryRelease(),
      sendDefaultPii: false,
      beforeSend: sentryBeforeSend,
    });
  }

  const workerRedisConfig = getGatewayWorkerRedisConfig();

  // Queues (producers) use non-blocking commands — maxRetriesPerRequest left at default (20) so
  // enqueue calls fail fast rather than hanging indefinitely if Redis is unavailable.
  const sharedProducerConn = createGatewayBullMqConnection();
  // Workers use maxRetriesPerRequest: null so they wait for Redis to recover instead of erroring.
  // setMaxListeners is raised to accommodate every worker plus our own error handler.
  const sharedWorkerConn = createGatewayBullMqConnection({ maxRetriesPerRequest: null });
  sharedProducerConn.on('error', (err: Error) => logger.error({ err: err.message }, '[Worker] Redis producer error'));
  sharedWorkerConn.setMaxListeners(20);
  sharedWorkerConn.on('error', (err: Error) => logger.error({ err: err.message }, '[Worker] Redis worker error'));

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
        label: 'redis-producer',
        close: async () => {
          await sharedProducerConn.quit().catch(() => sharedProducerConn.disconnect());
        },
      },
      {
        label: 'redis-worker',
        close: async () => {
          await sharedWorkerConn.quit().catch(() => sharedWorkerConn.disconnect());
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

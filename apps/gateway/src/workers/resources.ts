import type { Queue, Worker, WorkerOptions } from 'bullmq';
import logger from '../logger.js';

import {
  closeShutdownResources,
  createGracefulShutdown,
  type ShutdownResource as GatewayShutdownResource,
  type Shutdown as GatewayWorkerShutdown,
  type ShutdownOptions as GatewayWorkerShutdownOptions,
} from '../shutdown.js';

export { registerShutdownSignals as registerGatewayShutdownSignals } from '../shutdown.js';
export type { GatewayShutdownResource, GatewayWorkerShutdown, GatewayWorkerShutdownOptions };

export type SharedGatewayWorkerOptions = Pick<WorkerOptions, 'connection' | 'drainDelay' | 'stalledInterval'>;

export interface GatewayHeartbeatResource {
  stop: () => void;
}

export interface GatewayWorkerResources {
  workers: Worker[];
  queues: Queue[];
  heartbeats: GatewayHeartbeatResource[];
  shutdownResources: GatewayShutdownResource[];
}

function emptyGatewayWorkerResources(): GatewayWorkerResources {
  return {
    workers: [],
    queues: [],
    heartbeats: [],
    shutdownResources: [],
  };
}

export function mergeGatewayWorkerResources(...resources: GatewayWorkerResources[]): GatewayWorkerResources {
  return resources.reduce<GatewayWorkerResources>((merged, resource) => {
    merged.workers.push(...resource.workers);
    merged.queues.push(...resource.queues);
    merged.heartbeats.push(...resource.heartbeats);
    merged.shutdownResources.push(...resource.shutdownResources);
    return merged;
  }, emptyGatewayWorkerResources());
}

export function createGatewayWorkerShutdown(
  resources: GatewayWorkerResources,
  options: GatewayWorkerShutdownOptions = {},
): GatewayWorkerShutdown {
  return createGracefulShutdown({
    ...options,
    async run() {
      logger.info('[Worker] Shutting down gracefully');
      const failures: unknown[] = [];
      for (const heartbeat of resources.heartbeats) {
        try {
          heartbeat.stop();
        } catch (error) {
          failures.push(error);
          logger.error({ err: error, resource: 'heartbeat' }, '[Worker] Shutdown resource failed');
        }
      }
      const closePhase = (entries: GatewayShutdownResource[]) => closeShutdownResources(entries, failures, (err, resource) => {
        logger.error({ err, resource }, '[Worker] Shutdown resource failed');
      });
      // Workers must finish while queues and their connections are still open.
      await closePhase(resources.workers.map((worker, index) => ({
        label: `worker-${index}`, close: () => worker.close(),
      })));
      await closePhase(resources.queues.map((queue, index) => ({
        label: `queue-${index}`, close: () => queue.close(),
      })));
      await closePhase(resources.shutdownResources);
      if (failures.length > 0) throw new AggregateError(failures, 'Worker shutdown cleanup failed');
    },
    onTimeout(timeoutMs) {
      logger.warn('[Worker] Graceful shutdown timed out — forcing exit');
      for (const worker of resources.workers) {
        void worker.close(true).catch((error: unknown) => {
          logger.error({ err: error, resource: 'worker' }, '[Worker] Force-close failed');
        });
      }
      return new Error(`Worker graceful shutdown timed out after ${timeoutMs}ms`);
    },
    onFailure(err) {
      logger.error({ err }, '[Worker] Graceful shutdown failed');
    },
  });
}

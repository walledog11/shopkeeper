import type { Queue, Worker, WorkerOptions } from 'bullmq';
import logger from '../logger.js';

type ShutdownCloseResult = void | Promise<void>;

export type SharedGatewayWorkerOptions = Pick<WorkerOptions, 'connection' | 'drainDelay' | 'stalledInterval'>;

export interface GatewayHeartbeatResource {
  stop: () => void;
}

export interface GatewayShutdownResource {
  label: string;
  close: () => ShutdownCloseResult;
}

export interface GatewayWorkerResources {
  workers: Worker[];
  queues: Queue[];
  heartbeats: GatewayHeartbeatResource[];
  shutdownResources: GatewayShutdownResource[];
}

export type GatewayWorkerShutdown = (exitProcess?: boolean) => Promise<void>;

export interface GatewayWorkerShutdownOptions {
  forceExitTimeoutMs?: number;
  exitProcess?: (code?: number) => never;
}

export function emptyGatewayWorkerResources(): GatewayWorkerResources {
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
  const forceExitTimeoutMs = options.forceExitTimeoutMs ?? 25_000;
  const exitProcess = options.exitProcess ?? process.exit;

  return async (shouldExitProcess = false) => {
    const forceExit = setTimeout(() => {
      logger.warn('[Worker] Graceful shutdown timed out — forcing exit');
      exitProcess(1);
    }, forceExitTimeoutMs);
    forceExit.unref();

    logger.info('[Worker] Shutting down gracefully');
    for (const heartbeat of resources.heartbeats) {
      heartbeat.stop();
    }

    await Promise.all(resources.workers.map((worker) => worker.close()));
    await Promise.all(resources.queues.map((queue) => queue.close()));
    await Promise.all(resources.shutdownResources.map((resource) => resource.close()));

    clearTimeout(forceExit);
    if (shouldExitProcess) exitProcess(0);
  };
}

export function registerGatewayShutdownSignals(shutdown: GatewayWorkerShutdown): () => void {
  const shutdownOnSignal = () => {
    void shutdown(true);
  };

  process.on('SIGTERM', shutdownOnSignal);
  process.on('SIGINT', shutdownOnSignal);

  return () => {
    process.off('SIGTERM', shutdownOnSignal);
    process.off('SIGINT', shutdownOnSignal);
  };
}

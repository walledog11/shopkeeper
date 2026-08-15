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
  exitProcess?: (code?: number) => unknown;
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
  let shutdownPromise: Promise<void> | undefined;
  let exitRequested = false;
  let exitCode: number | undefined;
  let exitCalled = false;

  const requestExit = (code: number) => {
    exitCode = code;
    if (exitRequested && !exitCalled) {
      exitCalled = true;
      exitProcess(code);
    }
  };

  const closePhase = async (
    entries: Array<{ label: string; close: () => ShutdownCloseResult }>,
    failures: unknown[],
  ) => {
    const results = await Promise.allSettled(
      entries.map((entry) => Promise.resolve().then(() => entry.close())),
    );
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') return;
      failures.push(result.reason);
      logger.error(
        { err: result.reason, resource: entries[index]?.label },
        '[Worker] Shutdown resource failed',
      );
    });
  };

  const runShutdown = (): Promise<void> => {
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

    const gracefulShutdown = (async () => {
      await closePhase(
        resources.workers.map((worker, index) => ({
          label: `worker-${index}`,
          close: () => worker.close(),
        })),
        failures,
      );
      await closePhase(
        resources.queues.map((queue, index) => ({
          label: `queue-${index}`,
          close: () => queue.close(),
        })),
        failures,
      );
      await closePhase(resources.shutdownResources, failures);

      if (failures.length > 0) {
        throw new AggregateError(failures, 'Worker shutdown cleanup failed');
      }
    })();

    let deadline: ReturnType<typeof setTimeout>;
    const timedOut = new Promise<never>((_resolve, reject) => {
      deadline = setTimeout(() => {
        logger.warn('[Worker] Graceful shutdown timed out — forcing exit');
        for (const worker of resources.workers) {
          void worker.close(true).catch((error: unknown) => {
            logger.error({ err: error, resource: 'worker' }, '[Worker] Force-close failed');
          });
        }
        requestExit(1);
        reject(new Error(`Worker graceful shutdown timed out after ${forceExitTimeoutMs}ms`));
      }, forceExitTimeoutMs);
      deadline.unref();
    });

    return Promise.race([gracefulShutdown, timedOut])
      .then(() => {
        requestExit(0);
      })
      .catch((error: unknown) => {
        logger.error({ err: error }, '[Worker] Graceful shutdown failed');
        requestExit(1);
        if (!exitRequested) throw error;
      })
      .finally(() => {
        clearTimeout(deadline);
      });
  };

  return (shouldExitProcess = false) => {
    if (shouldExitProcess) {
      exitRequested = true;
      if (exitCode !== undefined) requestExit(exitCode);
    }
    shutdownPromise ??= runShutdown();
    return shutdownPromise;
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

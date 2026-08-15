import type { Server } from 'node:http';
import logger from './logger.js';

type ShutdownCloseResult = void | Promise<void>;

export interface GatewayServerCleanupResource {
  label: string;
  close: () => ShutdownCloseResult;
}

export type GatewayServerShutdown = (exitProcess?: boolean) => Promise<void>;

export interface GatewayServerShutdownOptions {
  forceExitTimeoutMs?: number;
  exitProcess?: (code?: number) => unknown;
}

class GatewayServerShutdownTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Gateway graceful shutdown timed out after ${timeoutMs}ms`);
    this.name = 'GatewayServerShutdownTimeoutError';
  }
}

function closeHttpServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

export function createGatewayServerShutdown(
  server: Server,
  cleanupResources: GatewayServerCleanupResource[],
  options: GatewayServerShutdownOptions = {},
): GatewayServerShutdown {
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

  const runShutdown = (): Promise<void> => {
    logger.info('[Shopkeeper Gateway] Shutting down gracefully');

    const gracefulShutdown = (async () => {
      const failures: unknown[] = [];

      try {
        // server.close() stops admission immediately and lets requests that were
        // already accepted finish before its callback runs.
        await closeHttpServer(server);
        logger.info('[Shopkeeper Gateway] HTTP server closed');
      } catch (error) {
        failures.push(error);
        logger.error({ err: error, resource: 'http-server' }, '[Shopkeeper Gateway] Shutdown resource failed');
      }

      const cleanupResults = await Promise.allSettled(
        cleanupResources.map((resource) => Promise.resolve().then(() => resource.close())),
      );
      cleanupResults.forEach((result, index) => {
        if (result.status === 'fulfilled') return;
        failures.push(result.reason);
        logger.error(
          { err: result.reason, resource: cleanupResources[index]?.label },
          '[Shopkeeper Gateway] Shutdown resource failed',
        );
      });

      if (failures.length > 0) {
        throw new AggregateError(failures, 'Gateway shutdown cleanup failed');
      }
    })();

    let deadline: ReturnType<typeof setTimeout>;
    const timedOut = new Promise<never>((_resolve, reject) => {
      deadline = setTimeout(() => {
        logger.warn('[Shopkeeper Gateway] Graceful shutdown timed out — force-closing connections');
        try {
          server.closeAllConnections?.();
        } catch (error) {
          logger.error({ err: error, resource: 'http-connections' }, '[Shopkeeper Gateway] Force-close failed');
        }
        requestExit(1);
        reject(new GatewayServerShutdownTimeoutError(forceExitTimeoutMs));
      }, forceExitTimeoutMs);
      deadline.unref();
    });

    return Promise.race([gracefulShutdown, timedOut])
      .then(() => {
        requestExit(0);
      })
      .catch((error: unknown) => {
        logger.error({ err: error }, '[Shopkeeper Gateway] Graceful shutdown failed');
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

export function registerGatewayServerShutdownSignals(shutdown: GatewayServerShutdown): () => void {
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

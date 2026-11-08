import type { Server } from 'node:http';
import logger from './logger.js';

import {
  closeShutdownResources,
  createGracefulShutdown,
  type ShutdownResource as GatewayServerCleanupResource,
  type Shutdown as GatewayServerShutdown,
  type ShutdownOptions as GatewayServerShutdownOptions,
} from './shutdown.js';

export { registerShutdownSignals as registerGatewayServerShutdownSignals } from './shutdown.js';
export type { GatewayServerCleanupResource, GatewayServerShutdown, GatewayServerShutdownOptions };

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
  return createGracefulShutdown({
    ...options,
    async run() {
      logger.info('[Shopkeeper Gateway] Shutting down gracefully');
      const failures: unknown[] = [];
      try {
        // Stop admission and drain accepted requests before closing dependencies.
        await closeHttpServer(server);
        logger.info('[Shopkeeper Gateway] HTTP server closed');
      } catch (error) {
        failures.push(error);
        logger.error({ err: error, resource: 'http-server' }, '[Shopkeeper Gateway] Shutdown resource failed');
      }
      await closeShutdownResources(cleanupResources, failures, (err, resource) => {
        logger.error({ err, resource }, '[Shopkeeper Gateway] Shutdown resource failed');
      });
      if (failures.length > 0) throw new AggregateError(failures, 'Gateway shutdown cleanup failed');
    },
    onTimeout(timeoutMs) {
      logger.warn('[Shopkeeper Gateway] Graceful shutdown timed out — force-closing connections');
      try {
        server.closeAllConnections?.();
      } catch (error) {
        logger.error({ err: error, resource: 'http-connections' }, '[Shopkeeper Gateway] Force-close failed');
      }
      return new GatewayServerShutdownTimeoutError(timeoutMs);
    },
    onFailure(err) {
      logger.error({ err }, '[Shopkeeper Gateway] Graceful shutdown failed');
    },
  });
}

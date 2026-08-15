import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('./logger.js', () => ({
  default: mockLogger,
}));

import { createGatewayServerShutdown } from './server-shutdown.js';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('gateway server shutdown', () => {
  it('stops HTTP admission and drains an active request before cleanup', async () => {
    let finishActiveRequest: ((error?: Error) => void) | undefined;
    const server = {
      close: vi.fn((callback: (error?: Error) => void) => {
        finishActiveRequest = callback;
        return server;
      }),
      closeAllConnections: vi.fn(),
    } as unknown as Server;
    const closeCleanup = vi.fn().mockResolvedValue(undefined);
    const shutdown = createGatewayServerShutdown(
      server,
      [{ label: 'cleanup', close: closeCleanup }],
      { exitProcess: vi.fn() },
    );

    const result = shutdown(false);

    expect(server.close).toHaveBeenCalledOnce();
    expect(server.closeAllConnections).not.toHaveBeenCalled();
    expect(closeCleanup).not.toHaveBeenCalled();

    finishActiveRequest?.();
    await result;

    expect(closeCleanup).toHaveBeenCalledOnce();
    expect(server.closeAllConnections).not.toHaveBeenCalled();
  });

  it('force-closes active connections only after the graceful deadline', async () => {
    vi.useFakeTimers();
    const server = {
      close: vi.fn(() => server),
      closeAllConnections: vi.fn(),
    } as unknown as Server;
    const shutdown = createGatewayServerShutdown(server, [], {
      forceExitTimeoutMs: 100,
      exitProcess: vi.fn(),
    });

    const result = shutdown(false);
    const rejection = expect(result).rejects.toThrow('timed out after 100ms');

    await vi.advanceTimersByTimeAsync(99);
    expect(server.closeAllConnections).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await rejection;
    expect(server.closeAllConnections).toHaveBeenCalledOnce();
  });

  it('coalesces repeated signal shutdowns into one drain and one exit', async () => {
    const activeRequest = deferred();
    const server = {
      close: vi.fn((callback: (error?: Error) => void) => {
        void activeRequest.promise.then(() => callback());
        return server;
      }),
      closeAllConnections: vi.fn(),
    } as unknown as Server;
    const closeCleanup = vi.fn().mockResolvedValue(undefined);
    const exitProcess = vi.fn();
    const shutdown = createGatewayServerShutdown(
      server,
      [{ label: 'cleanup', close: closeCleanup }],
      { exitProcess },
    );

    const firstSignal = shutdown(true);
    const secondSignal = shutdown(true);

    expect(secondSignal).toBe(firstSignal);
    expect(server.close).toHaveBeenCalledOnce();

    activeRequest.resolve();
    await firstSignal;

    expect(closeCleanup).toHaveBeenCalledOnce();
    expect(exitProcess).toHaveBeenCalledOnce();
    expect(exitProcess).toHaveBeenCalledWith(0);
  });

  it('attempts every cleanup resource and exits nonzero when one rejects', async () => {
    const server = {
      close: vi.fn((callback: (error?: Error) => void) => {
        callback();
        return server;
      }),
      closeAllConnections: vi.fn(),
    } as unknown as Server;
    const cleanupError = new Error('redis close failed');
    const rejectedCleanup = vi.fn().mockRejectedValue(cleanupError);
    const successfulCleanup = vi.fn().mockResolvedValue(undefined);
    const exitProcess = vi.fn();
    const shutdown = createGatewayServerShutdown(server, [
      { label: 'redis', close: rejectedCleanup },
      { label: 'database', close: successfulCleanup },
    ], { exitProcess });

    await shutdown(true);

    expect(rejectedCleanup).toHaveBeenCalledOnce();
    expect(successfulCleanup).toHaveBeenCalledOnce();
    expect(mockLogger.error).toHaveBeenCalledWith(
      { err: cleanupError, resource: 'redis' },
      '[Shopkeeper Gateway] Shutdown resource failed',
    );
    expect(exitProcess).toHaveBeenCalledOnce();
    expect(exitProcess).toHaveBeenCalledWith(1);
  });
});

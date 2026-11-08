import type { Queue, Worker } from 'bullmq';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGatewayWorkerShutdown, registerGatewayShutdownSignals, type GatewayWorkerResources } from './resources.js';
import { registerGatewayServerShutdownSignals } from '../server-shutdown.js';
import { isGatewayShutdownListener } from '../shutdown-signals.js';

afterEach(() => vi.useRealTimers());

function resources(overrides: Partial<GatewayWorkerResources> = {}): GatewayWorkerResources {
  return { workers: [], queues: [], heartbeats: [], shutdownResources: [], ...overrides };
}

describe('worker shutdown', () => {
  it.each([
    ['server', registerGatewayServerShutdownSignals],
    ['worker', registerGatewayShutdownSignals],
  ] as const)('marks %s signal listeners as gateway-owned so Spectrum preserves them', (_label, register) => {
    const before = new Set(process.listeners('SIGTERM'));
    const shutdown = vi.fn().mockResolvedValue(undefined);
    const remove = register(shutdown);
    try {
      const added = process.listeners('SIGTERM').filter(listener => !before.has(listener));
      expect(added).toHaveLength(1);
      const listener = added[0]!;
      expect(isGatewayShutdownListener(listener)).toBe(true);
      expect(process.listeners('SIGINT')).toContain(listener);
      listener('SIGTERM');
      expect(shutdown).toHaveBeenCalledWith(true);
      remove();
      expect(process.listeners('SIGTERM')).not.toContain(listener);
      expect(process.listeners('SIGINT')).not.toContain(listener);
    } finally {
      remove();
    }
  });

  it('stops heartbeats and drains workers before closing queues and connections', async () => {
    const order: string[] = [];
    let finish!: () => void;
    const drained = new Promise<void>(resolve => { finish = resolve; });
    const shutdown = createGatewayWorkerShutdown(resources({
      heartbeats: [{ stop: () => { order.push('heartbeat'); } }],
      workers: [{ close: async () => { order.push('worker'); await drained; } } as Worker],
      queues: [{ close: async () => { order.push('queue'); } } as Queue],
      shutdownResources: [{ label: 'redis', close: () => { order.push('redis'); } }],
    }));

    const pending = shutdown();
    await Promise.resolve();
    expect(order).toEqual(['heartbeat', 'worker']);
    finish();
    await pending;
    expect(order).toEqual(['heartbeat', 'worker', 'queue', 'redis']);
  });

  it('still closes later phases after worker failure and exits once with failure', async () => {
    const exitProcess = vi.fn();
    const closeQueue = vi.fn().mockResolvedValue(undefined);
    const closeConnection = vi.fn();
    const shutdown = createGatewayWorkerShutdown(resources({
      workers: [{ close: vi.fn().mockRejectedValue(new Error('worker failed')) } as unknown as Worker],
      queues: [{ close: closeQueue } as unknown as Queue],
      shutdownResources: [{ label: 'redis', close: closeConnection }],
    }), { exitProcess });
    const first = shutdown(true);
    expect(shutdown(true)).toBe(first);
    await first;
    expect(closeQueue).toHaveBeenCalledOnce();
    expect(closeConnection).toHaveBeenCalledOnce();
    expect(exitProcess.mock.calls).toEqual([[1]]);
  });

  it('force-closes workers only when their drain exceeds the deadline', async () => {
    vi.useFakeTimers();
    const close = vi.fn((force?: boolean) => force ? Promise.resolve() : new Promise<void>(() => {}));
    const shutdown = createGatewayWorkerShutdown(resources({
      workers: [{ close } as unknown as Worker],
    }), { forceExitTimeoutMs: 100 });
    const pending = shutdown();
    const rejection = expect(pending).rejects.toThrow('timed out after 100ms');
    await vi.advanceTimersByTimeAsync(99);
    expect(close.mock.calls).toEqual([[]]);
    await vi.advanceTimersByTimeAsync(1);
    await rejection;
    expect(close.mock.calls).toEqual([[], [true]]);
  });

  it('honors an exit request after cleanup completed without repeating cleanup', async () => {
    const exitProcess = vi.fn();
    const close = vi.fn();
    const shutdown = createGatewayWorkerShutdown(resources({
      shutdownResources: [{ label: 'connection', close }],
    }), { exitProcess });
    const completed = shutdown();
    await completed;
    expect(exitProcess).not.toHaveBeenCalled();
    expect(shutdown(true)).toBe(completed);
    expect(shutdown(true)).toBe(completed);
    expect(close).toHaveBeenCalledOnce();
    expect(exitProcess.mock.calls).toEqual([[0]]);
  });
});

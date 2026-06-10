/**
 * Host-injected thread mutex seam. The agent core (executeAgentTurn) takes a
 * LockProvider so each host supplies its own Redis: the dashboard uses Upstash
 * (REST), the gateway worker uses ioredis (REDIS_URL) — separate instances.
 */
export interface ThreadLock {
  release(): Promise<void>;
}

export interface LockAcquireOptions {
  ttlSeconds?: number;
  /**
   * When true, refuse to proceed without a real lock if Redis is unavailable.
   * Mutating agent turns use this; read-only paths may omit it and fail open.
   */
  failClosed?: boolean;
}

export interface LockProvider {
  /**
   * Acquire the per-thread mutex. Resolves to a ThreadLock on success, or null
   * when another holder owns it. By default, implementations fail open (return
   * a no-op lock) if Redis is unreachable; pass `failClosed: true` to block
   * instead.
   */
  acquire(threadId: string, options?: LockAcquireOptions): Promise<ThreadLock | null>;
}

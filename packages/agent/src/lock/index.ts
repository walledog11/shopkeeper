/**
 * Host-injected thread latency-guard seam. The agent core (executeAgentTurn)
 * takes a LockProvider so each host supplies its own Redis: the dashboard uses
 * Upstash (REST), the gateway worker uses ioredis (REDIS_URL) — separate
 * instances. Durable PostgreSQL claims, not this host-local mutex, own
 * cross-process single-use correctness.
 */
export interface ThreadLock {
  release(): Promise<void>;
  /** True after token-checked renewal proves this caller no longer owns the lease. */
  isLost?(): boolean;
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

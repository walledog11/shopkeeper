/**
 * Host-injected thread mutex seam. The agent core (executeAgentTurn) takes a
 * LockProvider so each host supplies its own Redis: the dashboard uses Upstash
 * (REST), the gateway worker uses ioredis (REDIS_URL) — separate instances.
 */
export interface ThreadLock {
  release(): Promise<void>;
}

export interface LockProvider {
  /**
   * Acquire the per-thread mutex. Resolves to a ThreadLock on success, or null
   * when another holder owns it. Implementations fail open (return a no-op lock)
   * if Redis is unreachable — the mutex is a soft race mitigation, not a hard
   * guarantee.
   */
  acquire(threadId: string, ttlSeconds?: number): Promise<ThreadLock | null>;
}

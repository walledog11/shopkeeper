export interface FixedWindowCounterClient {
  incr: (key: string) => Promise<number>;
  expire: (key: string, seconds: number) => Promise<unknown>;
}

export interface FixedWindowPeriod {
  windowStart: number;
  resetAt: number;
}

export function getFixedWindowPeriod(windowSecs: number, nowMs = Date.now()): FixedWindowPeriod {
  const now = Math.floor(nowMs / 1000);
  const windowStart = Math.floor(now / windowSecs);
  const resetAt = (windowStart + 1) * windowSecs;
  return { windowStart, resetAt };
}

export async function incrementFixedWindowCounter(
  client: FixedWindowCounterClient,
  key: string,
  windowSecs: number,
): Promise<number> {
  const count = await client.incr(key);
  if (count === 1) {
    await client.expire(key, windowSecs);
  }
  return count;
}
function positiveInt(env: NodeJS.ProcessEnv, name: string, fallback: number, maximum: number): number {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${name} must be an integer between 1 and ${maximum}`);
  }
  return value;
}

export function databasePoolConfig(env: NodeJS.ProcessEnv = process.env) {
  const max = positiveInt(env, 'DB_POOL_MAX', 5, 50);
  const connectTimeoutMs = positiveInt(env, 'DB_CONNECT_TIMEOUT_MS', 5_000, 120_000);
  const queryTimeoutMs = positiveInt(env, 'DB_QUERY_TIMEOUT_MS', 15_000, 300_000);
  const poolWaitTimeoutMs = positiveInt(env, 'DB_POOL_WAIT_TIMEOUT_MS', 5_000, 120_000);
  // The client is created on import, and plenty of importers never query (unit
  // tests, builds collecting routes, scripts). Without a URL there is nothing to
  // configure; Prisma reports the missing variable on the first query instead.
  if (!env.DATABASE_URL) return null;
  const url = new URL(env.DATABASE_URL);
  url.searchParams.set('connection_limit', String(max));
  url.searchParams.set('connect_timeout', String(Math.ceil(connectTimeoutMs / 1000)));
  url.searchParams.set('pool_timeout', String(Math.ceil(poolWaitTimeoutMs / 1000)));
  url.searchParams.set('socket_timeout', String(Math.ceil(queryTimeoutMs / 1000)));
  return {
    nativeUrl: url.toString(),
    driver: {
      connectionString: env.DATABASE_URL, max,
      connectionTimeoutMillis: Math.min(connectTimeoutMs, poolWaitTimeoutMs),
      idleTimeoutMillis: 10_000,
      statement_timeout: queryTimeoutMs,
      query_timeout: queryTimeoutMs,
    },
  };
}

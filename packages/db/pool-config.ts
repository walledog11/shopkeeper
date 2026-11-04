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
  const shared = {
    connectionString: env.DATABASE_URL,
    max,
    connectionTimeoutMillis: Math.min(connectTimeoutMs, poolWaitTimeoutMs),
    query_timeout: queryTimeoutMs,
  };
  return {
    // node-postgres behind Neon's PgBouncer. The deadline stays client-side, as
    // it was under Prisma's engine: PgBouncer refuses a startup parameter it is
    // not configured to accept, and statement_timeout is one. Idle connections
    // stay open across the gaps between messages, so a reply does not pay a
    // fresh TLS handshake and login.
    pg: { ...shared, idleTimeoutMillis: 300_000, keepAlive: true, allowExitOnIdle: true },
    driver: { ...shared, idleTimeoutMillis: 10_000, statement_timeout: queryTimeoutMs },
    schema: new URL(env.DATABASE_URL).searchParams.get('schema') ?? undefined,
  };
}

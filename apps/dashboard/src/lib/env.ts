function readEnv(name: string): string | null {
  const value = process.env[name];
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function hasEnv(name: string): boolean {
  return readEnv(name) !== null;
}

function requireEnv(name: string): string {
  const value = readEnv(name);
  if (!value) {
    throw new Error(`[Dashboard] Missing required environment variable: ${name}`);
  }
  return value;
}

function normalizeAbsoluteUrl(name: string, value = requireEnv(name)): string {

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`[Dashboard] ${name} must be a valid absolute URL`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`[Dashboard] ${name} must use http or https`);
  }

  return value.replace(/\/+$/, '');
}

export function getDashboardAppUrl(): string {
  const appUrl = readEnv('APP_URL');
  if (appUrl) {
    return normalizeAbsoluteUrl('APP_URL', appUrl);
  }

  if (process.env.NODE_ENV !== 'production') {
    const publicAppUrl = readEnv('NEXT_PUBLIC_APP_URL');
    if (publicAppUrl) {
      return normalizeAbsoluteUrl('NEXT_PUBLIC_APP_URL', publicAppUrl);
    }

    return 'http://localhost:3000';
  }

  throw new Error('[Dashboard] Missing required environment variable: APP_URL');
}

export function validateDashboardEnv(): void {
  const required = [
    'DATABASE_URL',
    'CLERK_SECRET_KEY',
    'OPENAI_API_KEY',
    'ANTHROPIC_API_KEY',
    'INTERNAL_API_SECRET',
  ] as const;

  const missing = required.filter((name) => !hasEnv(name));
  if (missing.length > 0) {
    throw new Error(`[Dashboard] Missing required environment variables: ${missing.join(', ')}`);
  }

  if (process.env.NODE_ENV === 'production') {
    const productionRequired = [
      'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
      'APP_URL',
    ] as const;
    const missingProduction = productionRequired.filter((name) => !hasEnv(name));
    if (missingProduction.length > 0) {
      throw new Error(
        `[Dashboard] Missing required production environment variables: ${missingProduction.join(', ')}`
      );
    }

    const appUrl = normalizeAbsoluteUrl('APP_URL');
    const publicAppUrl = readEnv('NEXT_PUBLIC_APP_URL');
    if (publicAppUrl) {
      const normalizedPublicAppUrl = normalizeAbsoluteUrl('NEXT_PUBLIC_APP_URL', publicAppUrl);
      if (appUrl !== normalizedPublicAppUrl) {
        throw new Error('[Dashboard] APP_URL and NEXT_PUBLIC_APP_URL must match in production');
      }
    }
  }

  const redisUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if ((redisUrl && !redisToken) || (!redisUrl && redisToken)) {
    throw new Error('[Dashboard] UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set together');
  }
  if (process.env.NODE_ENV === 'production' && (!redisUrl || !redisToken)) {
    throw new Error('[Dashboard] Missing required environment variables: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN');
  }

  const dbUrl = requireEnv('DATABASE_URL');
  if (!dbUrl.includes('pgbouncer=true')) {
    console.warn('[Dashboard] DATABASE_URL is missing pgbouncer=true — add it to avoid connection exhaustion in production');
  }
  if (!dbUrl.includes('connection_limit=')) {
    console.warn('[Dashboard] DATABASE_URL is missing connection_limit — add it (e.g. connection_limit=1) to avoid connection exhaustion in production');
  }
}

export function getDashboardRedisEnv(): { url: string; token: string } {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  if (!url || !token) {
    throw new Error('[Dashboard] Redis is not configured. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.');
  }

  return { url, token };
}

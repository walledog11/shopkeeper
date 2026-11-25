export type AnalyticsEnvironment = 'production' | 'preview' | 'staging' | 'development' | 'test';

export interface ProductAnalyticsConfig {
  enabled: boolean;
  environment: AnalyticsEnvironment;
  projectToken?: string;
  host: string;
}

const DEFAULT_POSTHOG_HOST = 'https://us.i.posthog.com';

function readEnv(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const value = env[name]?.trim();
  return value ? value : undefined;
}

function parseEnabled(env: NodeJS.ProcessEnv): boolean {
  if (env.NODE_ENV === 'test') return false;

  const value = readEnv(env, 'PRODUCT_ANALYTICS_ENABLED');
  if (!value) {
    if (env.NODE_ENV === 'production') {
      throw new Error('PRODUCT_ANALYTICS_ENABLED must be explicitly set in production');
    }
    return false;
  }
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error('PRODUCT_ANALYTICS_ENABLED must be either true or false');
}

export function resolveAnalyticsEnvironment(env: NodeJS.ProcessEnv): AnalyticsEnvironment {
  if (env.NODE_ENV === 'test') return 'test';

  const vercelEnvironment = readEnv(env, 'VERCEL_ENV')?.toLowerCase();
  if (vercelEnvironment === 'production') return 'production';
  if (vercelEnvironment === 'preview') return 'preview';
  if (vercelEnvironment === 'development') return 'development';

  const railwayEnvironment = readEnv(env, 'RAILWAY_ENVIRONMENT_NAME')?.toLowerCase();
  if (railwayEnvironment?.includes('staging')) return 'staging';
  if (railwayEnvironment?.includes('preview')) return 'preview';
  if (railwayEnvironment?.includes('production')) return 'production';

  return env.NODE_ENV === 'production' ? 'production' : 'development';
}

function parseProductAnalyticsConfig(env: NodeJS.ProcessEnv): ProductAnalyticsConfig {
  const enabled = parseEnabled(env);
  const host = readEnv(env, 'POSTHOG_HOST') ?? DEFAULT_POSTHOG_HOST;
  const projectToken = readEnv(env, 'POSTHOG_PROJECT_TOKEN');

  if (enabled) {
    if (!projectToken) {
      throw new Error('POSTHOG_PROJECT_TOKEN is required when product analytics is enabled');
    }

    let parsedHost: URL;
    try {
      parsedHost = new URL(host);
    } catch {
      throw new Error('POSTHOG_HOST must be a valid HTTPS URL');
    }
    if (parsedHost.protocol !== 'https:') {
      throw new Error('POSTHOG_HOST must be a valid HTTPS URL');
    }
  }

  return {
    enabled,
    environment: resolveAnalyticsEnvironment(env),
    ...(projectToken ? { projectToken } : {}),
    host,
  };
}

// The settings, or why they can't be used. A bad analytics setting turns capture
// off instead of stopping the app: no event is worth an outage (a missing flag
// once took the dashboard, the public site and the health check down together),
// and off is the privacy-safe reading of a setting nobody can trust. Each app
// logs the problem at startup.
export function resolveProductAnalyticsConfig(
  env: NodeJS.ProcessEnv = process.env,
): { config: ProductAnalyticsConfig; problem: string | null } {
  try {
    return { config: parseProductAnalyticsConfig(env), problem: null };
  } catch (error) {
    return {
      config: {
        enabled: false,
        environment: resolveAnalyticsEnvironment(env),
        host: readEnv(env, 'POSTHOG_HOST') ?? DEFAULT_POSTHOG_HOST,
      },
      problem: error instanceof Error ? error.message : String(error),
    };
  }
}

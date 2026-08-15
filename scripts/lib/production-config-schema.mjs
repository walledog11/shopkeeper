const HTTP_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * The production-sensitive gateway fields shared by runtime startup and the
 * deploy-time environment verifier. Defaults may depend on NODE_ENV, but all
 * accepted syntax and enum members live here.
 */
export const GATEWAY_PRODUCTION_CONFIG_SCHEMA = Object.freeze({
  DASHBOARD_URL: { type: 'url' },
  DASHBOARD_INTERNAL_URL: { type: 'url' },
  POSTHOG_HOST: { type: 'url' },
  EMAIL_INBOUND_MODE: {
    type: 'enum',
    values: ['hybrid', 'postmark', 'gmail-only'],
    defaultValue: 'hybrid',
    normalize: 'lowercase',
  },
  GATEWAY_RUNTIME_ROLE: {
    type: 'enum',
    values: ['all', 'server', 'worker'],
    defaultValue: 'all',
    normalize: 'lowercase',
  },
  PRODUCT_ANALYTICS_ENABLED: { type: 'boolean', defaultValue: false },
  PLAN_EXECUTION_LEDGER_MODE: {
    type: 'enum',
    values: ['off', 'shadow', 'enforce'],
  },
  AGENT_CONTEXT_BUDGET_MODE: {
    type: 'enum',
    values: ['off', 'shadow', 'enforce'],
  },
  GMAIL_NATIVE_INBOUND: { type: 'boolean', defaultValue: false },
  GATEWAY_ENABLE_MAINTENANCE_WORKERS: { type: 'boolean', defaultValue: true },
  GATEWAY_BULLMQ_DRAIN_DELAY_SECONDS: { type: 'positiveInteger' },
  GATEWAY_BULLMQ_STALLED_INTERVAL_MS: { type: 'positiveInteger' },
  GATEWAY_WORKER_HEARTBEAT_INTERVAL_MS: { type: 'positiveInteger' },
  GATEWAY_WORKER_HEARTBEAT_TTL_SECS: { type: 'positiveInteger' },
  GATEWAY_WORKER_HEARTBEAT_STALE_MS: { type: 'positiveInteger' },
  GATEWAY_QUEUE_DIAGNOSTICS_CACHE_MS: { type: 'positiveInteger' },
});

function readOptionalEnv(env, name) {
  const value = env[name];
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseSchemaField(env, name, fallback) {
  const field = GATEWAY_PRODUCTION_CONFIG_SCHEMA[name];
  if (!field) throw new Error(`Unknown gateway production configuration field: ${name}`);

  const rawValue = readOptionalEnv(env, name);
  if (rawValue === undefined) {
    return fallback ?? field.defaultValue;
  }

  if (field.type === 'url') {
    let parsed;
    try {
      parsed = new URL(rawValue);
    } catch {
      throw new Error(`${name} must be a valid absolute URL`);
    }
    if (!HTTP_PROTOCOLS.has(parsed.protocol)) {
      throw new Error(`${name} must use http or https`);
    }
    return rawValue.replace(/\/+$/, '');
  }

  if (field.type === 'boolean') {
    if (rawValue === 'true') return true;
    if (rawValue === 'false') return false;
    throw new Error(`${name} must be either true or false`);
  }

  if (field.type === 'positiveInteger') {
    if (!/^[1-9]\d*$/.test(rawValue)) {
      throw new Error(`${name} must be a positive integer`);
    }
    const parsed = Number(rawValue);
    if (!Number.isSafeInteger(parsed)) {
      throw new Error(`${name} must be a positive safe integer`);
    }
    return parsed;
  }

  const normalized = field.normalize === 'lowercase' ? rawValue.toLowerCase() : rawValue;
  if (!field.values.includes(normalized)) {
    throw new Error(`${name} must be one of: ${field.values.join(', ')}`);
  }
  return normalized;
}

export function parseGatewayProductionConfig(env = process.env) {
  const isProduction = readOptionalEnv(env, 'NODE_ENV') === 'production';
  const heartbeatIntervalMs = parseSchemaField(
    env,
    'GATEWAY_WORKER_HEARTBEAT_INTERVAL_MS',
    isProduction ? 300_000 : 15_000,
  );
  const heartbeatTtlSecs = parseSchemaField(
    env,
    'GATEWAY_WORKER_HEARTBEAT_TTL_SECS',
    Math.max(Math.ceil((heartbeatIntervalMs * 3) / 1000), 60),
  );

  return {
    dashboardUrl: parseSchemaField(env, 'DASHBOARD_URL'),
    dashboardInternalUrl: parseSchemaField(env, 'DASHBOARD_INTERNAL_URL'),
    posthogHost: parseSchemaField(env, 'POSTHOG_HOST'),
    emailInboundMode: parseSchemaField(env, 'EMAIL_INBOUND_MODE'),
    runtimeRole: parseSchemaField(env, 'GATEWAY_RUNTIME_ROLE'),
    productAnalyticsEnabled: parseSchemaField(env, 'PRODUCT_ANALYTICS_ENABLED'),
    planExecutionLedgerMode: parseSchemaField(env, 'PLAN_EXECUTION_LEDGER_MODE'),
    agentContextBudgetMode: parseSchemaField(env, 'AGENT_CONTEXT_BUDGET_MODE'),
    gmailNativeInbound: parseSchemaField(env, 'GMAIL_NATIVE_INBOUND'),
    workerRedis: {
      drainDelaySeconds: parseSchemaField(
        env,
        'GATEWAY_BULLMQ_DRAIN_DELAY_SECONDS',
        isProduction ? 60 : 5,
      ),
      stalledIntervalMs: parseSchemaField(
        env,
        'GATEWAY_BULLMQ_STALLED_INTERVAL_MS',
        isProduction ? 300_000 : 30_000,
      ),
      heartbeatIntervalMs,
      heartbeatTtlSecs,
      heartbeatStaleMs: Math.min(
        parseSchemaField(
          env,
          'GATEWAY_WORKER_HEARTBEAT_STALE_MS',
          Math.max(heartbeatIntervalMs * 2, 60_000),
        ),
        heartbeatTtlSecs * 1000,
      ),
      queueDiagnosticsCacheMs: parseSchemaField(
        env,
        'GATEWAY_QUEUE_DIAGNOSTICS_CACHE_MS',
        isProduction ? 30_000 : 5_000,
      ),
      maintenanceWorkersEnabled: parseSchemaField(
        env,
        'GATEWAY_ENABLE_MAINTENANCE_WORKERS',
      ),
    },
  };
}

export function validateGatewayProductionConfig(env = process.env) {
  const errors = [];
  for (const name of Object.keys(GATEWAY_PRODUCTION_CONFIG_SCHEMA)) {
    try {
      parseSchemaField(env, name);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  return errors;
}

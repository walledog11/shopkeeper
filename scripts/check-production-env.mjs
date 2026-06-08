import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const VALID_TARGETS = ['dashboard', 'gateway', 'all'];
const VALID_SCOPES = ['boot', 'launch'];

const CONTRACTS = {
  dashboard: {
    label: 'Dashboard',
    bootRequired: [
      'DATABASE_URL',
      'DIRECT_DATABASE_URL',
      'CLERK_SECRET_KEY',
      'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
      'ANTHROPIC_API_KEY',
      'INTERNAL_API_SECRET',
      'APP_URL',
      'TOKEN_ENCRYPTION_KEY',
      'UPSTASH_REDIS_REST_URL',
      'UPSTASH_REDIS_REST_TOKEN',
    ],
    launchRequired: [
      'GATEWAY_INTERNAL_URL',
      'POSTMARK_API_KEY',
      'INBOUND_EMAIL_DOMAIN',
      'BLOB_READ_WRITE_TOKEN',
      'SHOPIFY_CLIENT_ID',
      'SHOPIFY_CLIENT_SECRET',
      'SHOPIFY_APP_SECRET',
      'STRIPE_SECRET_KEY',
      'STRIPE_WEBHOOK_SECRET',
      'CLERK_WEBHOOK_SECRET',
      'PRICE_ID_STARTER',
      'PRICE_ID_PRO',
    ],
    absoluteUrlVars: ['APP_URL', 'NEXT_PUBLIC_APP_URL', 'GATEWAY_INTERNAL_URL', 'TWILIO_WEBHOOK_URL'],
    equalPairs: [['APP_URL', 'NEXT_PUBLIC_APP_URL']],
  },
  gateway: {
    label: 'Gateway',
    bootRequired: [
      'DATABASE_URL',
      'DIRECT_DATABASE_URL',
      'REDIS_URL',
      'ANTHROPIC_API_KEY',
      'INTERNAL_API_SECRET',
      'DASHBOARD_URL',
      'TOKEN_ENCRYPTION_KEY',
    ],
    launchRequired: [
      'SHOPIFY_APP_SECRET',
      'BLOB_READ_WRITE_TOKEN',
      'POSTMARK_INBOUND_USERNAME',
      'POSTMARK_INBOUND_PASSWORD',
    ],
    absoluteUrlVars: ['DASHBOARD_URL', 'TWILIO_WEBHOOK_URL'],
    expectedPathSuffixes: {
      TWILIO_WEBHOOK_URL: '/webhooks/twilio',
    },
  },
};

function parseEnvFileContents(contents) {
  const parsed = {};

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const exportPrefix = line.startsWith('export ') ? 'export ' : '';
    const assignment = exportPrefix ? line.slice(exportPrefix.length) : line;
    const equalsIndex = assignment.indexOf('=');
    if (equalsIndex <= 0) {
      continue;
    }

    const key = assignment.slice(0, equalsIndex).trim();
    let value = assignment.slice(equalsIndex + 1).trim();
    if (!key) {
      continue;
    }

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith('\'') && value.endsWith('\''))
    ) {
      value = value.slice(1, -1);
    } else {
      const commentIndex = value.indexOf(' #');
      if (commentIndex >= 0) {
        value = value.slice(0, commentIndex).trimEnd();
      }
    }

    parsed[key] = value;
  }

  return parsed;
}

function loadEnvFile(pathname) {
  const absolutePath = resolve(pathname);
  if (!existsSync(absolutePath)) {
    throw new Error(`Env file not found: ${absolutePath}`);
  }

  return {
    absolutePath,
    values: parseEnvFileContents(readFileSync(absolutePath, 'utf8')),
  };
}

function readEnv(env, name) {
  const value = env[name];
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeAbsoluteUrl(name, value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid absolute URL`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`${name} must use http or https`);
  }

  return value.replace(/\/+$/, '');
}

function getRequiredNames(target, scope) {
  const contract = CONTRACTS[target];
  return scope === 'boot'
    ? [...contract.bootRequired]
    : [...contract.bootRequired, ...contract.launchRequired];
}

export function validateProductionEnv(target, options = {}) {
  const env = options.env ?? process.env;
  const scope = options.scope ?? 'launch';
  const contract = CONTRACTS[target];

  if (!contract) {
    throw new Error(`Unsupported target: ${target}`);
  }
  if (!VALID_SCOPES.includes(scope)) {
    throw new Error(`Unsupported scope: ${scope}`);
  }

  const errors = [];
  const warnings = [];
  const normalizedUrls = {};
  const requiredNames = getRequiredNames(target, scope);

  for (const name of requiredNames) {
    if (!readEnv(env, name)) {
      errors.push(`Missing required environment variable: ${name}`);
    }
  }

  for (const name of contract.absoluteUrlVars) {
    const value = readEnv(env, name);
    if (!value) {
      continue;
    }

    try {
      normalizedUrls[name] = normalizeAbsoluteUrl(name, value);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  for (const [left, right] of contract.equalPairs ?? []) {
    const leftUrl = normalizedUrls[left];
    const rightUrl = normalizedUrls[right];
    if (leftUrl && rightUrl && leftUrl !== rightUrl) {
      errors.push(`${left} and ${right} must match`);
    }
  }

  for (const [name, suffix] of Object.entries(contract.expectedPathSuffixes ?? {})) {
    const value = normalizedUrls[name];
    if (!value) {
      continue;
    }

    const parsed = new URL(value);
    if (parsed.pathname !== suffix) {
      errors.push(`${name} must point to ${suffix}`);
    }
  }

  const databaseUrl = readEnv(env, 'DATABASE_URL');
  const directDatabaseUrl = readEnv(env, 'DIRECT_DATABASE_URL');
  if (databaseUrl && !databaseUrl.includes('pgbouncer=true')) {
    warnings.push('DATABASE_URL is missing pgbouncer=true');
  }
  if (databaseUrl && !databaseUrl.includes('connection_limit=')) {
    warnings.push('DATABASE_URL is missing connection_limit (for example connection_limit=1)');
  }
  if (directDatabaseUrl && directDatabaseUrl.includes('pgbouncer=true')) {
    warnings.push('DIRECT_DATABASE_URL must not use pgbouncer=true; use the direct Neon host for migrations');
  }
  if (directDatabaseUrl && directDatabaseUrl.includes('-pooler')) {
    warnings.push('DIRECT_DATABASE_URL appears to use a pooler host; use the direct Neon host instead');
  }
  if (databaseUrl && directDatabaseUrl && databaseUrl === directDatabaseUrl) {
    warnings.push(
      'DIRECT_DATABASE_URL should differ from DATABASE_URL in production; use the pooled URL for runtime and the direct URL for migrations'
    );
  }

  if (target === 'gateway') {
    const redisUrl = readEnv(env, 'REDIS_URL');
    if (redisUrl && !redisUrl.startsWith('rediss://')) {
      warnings.push('REDIS_URL is not using the TLS rediss:// form');
    }
  }

  if (target === 'dashboard' && readEnv(env, 'GATEWAY_PUBLIC_URL')) {
    warnings.push('GATEWAY_PUBLIC_URL is deprecated; use GATEWAY_INTERNAL_URL as the canonical dashboard gateway base URL');
  }

  return {
    target,
    scope,
    requiredNames,
    errors,
    warnings,
  };
}

function parseArgs(argv) {
  const [targetArg = 'all', ...rest] = argv;
  const scopeArg = rest.find((arg) => arg.startsWith('--scope=')) ?? '--scope=launch';
  const envFileArg = rest.find((arg) => arg.startsWith('--env-file='));
  const dashboardEnvFileArg = rest.find((arg) => arg.startsWith('--dashboard-env-file='));
  const gatewayEnvFileArg = rest.find((arg) => arg.startsWith('--gateway-env-file='));
  const scope = scopeArg.slice('--scope='.length);

  if (!VALID_TARGETS.includes(targetArg)) {
    throw new Error(`Unsupported target: ${targetArg}`);
  }
  if (!VALID_SCOPES.includes(scope)) {
    throw new Error(`Unsupported scope: ${scope}`);
  }

  const targets = targetArg === 'all' ? ['dashboard', 'gateway'] : [targetArg];
  const envFiles = {
    common: envFileArg ? envFileArg.slice('--env-file='.length) : null,
    dashboard: dashboardEnvFileArg ? dashboardEnvFileArg.slice('--dashboard-env-file='.length) : null,
    gateway: gatewayEnvFileArg ? gatewayEnvFileArg.slice('--gateway-env-file='.length) : null,
  };

  if (targetArg === 'all' && envFiles.common) {
    throw new Error('Use --dashboard-env-file and --gateway-env-file with target=all, or run each target separately with --env-file');
  }

  return { targets, scope, envFiles };
}

function printResult(result) {
  const prefix = `[check-production-env] ${CONTRACTS[result.target].label} (${result.scope})`;

  if (result.errors.length === 0) {
    console.log(`${prefix}: OK`);
  } else {
    console.error(`${prefix}: FAILED`);
    for (const error of result.errors) {
      console.error(`  error: ${error}`);
    }
  }

  for (const warning of result.warnings) {
    console.warn(`  warning: ${warning}`);
  }

  if (result.envFilePath) {
    console.log(`  env-file: ${result.envFilePath}`);
  }
}

async function main(argv = process.argv.slice(2)) {
  const { targets, scope, envFiles } = parseArgs(argv);
  const loadedEnvFiles = {};

  if (envFiles.common) {
    loadedEnvFiles.common = loadEnvFile(envFiles.common);
  }
  if (envFiles.dashboard) {
    loadedEnvFiles.dashboard = loadEnvFile(envFiles.dashboard);
  }
  if (envFiles.gateway) {
    loadedEnvFiles.gateway = loadEnvFile(envFiles.gateway);
  }

  const results = targets.map((target) => {
    const targetEnvFile = loadedEnvFiles[target] ?? loadedEnvFiles.common ?? null;
    const mergedEnv = targetEnvFile
      ? { ...process.env, ...targetEnvFile.values }
      : process.env;
    const result = validateProductionEnv(target, { scope, env: mergedEnv });

    return {
      ...result,
      envFilePath: targetEnvFile?.absolutePath ?? null,
    };
  });

  for (const result of results) {
    printResult(result);
  }

  if (results.some((result) => result.errors.length > 0)) {
    process.exitCode = 1;
    return;
  }

  console.log('[check-production-env] Production env contract satisfied');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, readdirSync, writeFileSync, constants } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assertLocalDevEnv, getDevEnv } from './with-dev-env.mjs';
import { detectDockerCompose, runCommand } from './test-infra.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COMPOSE_FILE = path.join(REPO_ROOT, 'docker-compose.test.yml');

function usable(value) {
  return typeof value === 'string' && value.trim() !== '' && !/replace[-_]|example\./i.test(value);
}

export function createSharedDevEnv(existing) {
  return {
    DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:55432/shopkeeper_dev?pgbouncer=true',
    DIRECT_DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:55432/shopkeeper_dev',
    NEON_SERVERLESS_HTTP: 'false',
    REDIS_URL: 'redis://127.0.0.1:56379/1',
    APP_URL: 'http://localhost:3000',
    NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
    DASHBOARD_URL: 'http://localhost:3000',
    DASHBOARD_INTERNAL_URL: 'http://localhost:3000',
    GATEWAY_INTERNAL_URL: 'http://localhost:8080',
    PORT: '8080',
    GATEWAY_ENABLE_MAINTENANCE_WORKERS: 'false',
    PRODUCT_ANALYTICS_ENABLED: 'false',
    INTERNAL_API_SECRET: usable(existing.INTERNAL_API_SECRET) ? existing.INTERNAL_API_SECRET : randomBytes(32).toString('hex'),
    TOKEN_ENCRYPTION_KEY: usable(existing.TOKEN_ENCRYPTION_KEY) ? existing.TOKEN_ENCRYPTION_KEY : randomBytes(32).toString('hex'),
    OAUTH_ATTEMPT_SECRET: usable(existing.OAUTH_ATTEMPT_SECRET) ? existing.OAUTH_ATTEMPT_SECRET : randomBytes(32).toString('hex'),
  };
}

async function setup() {
  const existing = getDevEnv();
  for (const [template, target] of [
    ['apps/dashboard/.env.example', 'apps/dashboard/.env.local'],
    ['apps/gateway/.env.example', 'apps/gateway/.env'],
    ['packages/db/.env.example', 'packages/db/.env'],
  ]) {
    if (existsSync(path.join(REPO_ROOT, target))) continue;
    copyFileSync(path.join(REPO_ROOT, template), path.join(REPO_ROOT, target), constants.COPYFILE_EXCL);
    console.log(`[dev:setup] Created ${target}; add development provider credentials there.`);
  }
  const sharedPath = path.join(REPO_ROOT, '.env.development.local');
  if (!existsSync(sharedPath)) {
    const values = createSharedDevEnv(existing);
    // These generated values are single-line URLs and secrets, never shell commands.
    const contents = Object.entries(values).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join('\n');
    writeFileSync(sharedPath, `# Shared local settings for both apps. Shell overrides take precedence.\n${contents}\n`, { mode: 0o600, flag: 'wx' });
    console.log('[dev:setup] Created .env.development.local; existing app credentials were preserved.');
  }

  const env = getDevEnv();
  assertLocalDevEnv(env);
  // This command creates a database in the bundled container, never an arbitrary target.
  for (const key of ['DATABASE_URL', 'DIRECT_DATABASE_URL']) {
    if (new URL(env[key]).port !== '55432') throw new Error(`[dev:setup] ${key} must use the bundled PostgreSQL port 55432.`);
  }
  const { command, baseArgs } = detectDockerCompose();
  const compose = [...baseArgs, '-f', COMPOSE_FILE];
  await runCommand(command, [...compose, 'up', '-d', '--wait', 'postgres', 'redis'], { env: process.env, cwd: REPO_ROOT });
  const query = spawnSync(command, [...compose, 'exec', '-T', 'postgres', 'psql', '-U', 'postgres', '-d', 'postgres', '-tAc', "SELECT 1 FROM pg_database WHERE datname = 'shopkeeper_dev'"], { encoding: 'utf8' });
  if (query.error || query.status !== 0) throw new Error('[dev:setup] Could not inspect the local PostgreSQL database.');
  if (query.stdout.trim() !== '1') {
    await runCommand(command, [...compose, 'exec', '-T', 'postgres', 'createdb', '-U', 'postgres', 'shopkeeper_dev'], { env: process.env });
    console.log('[dev:setup] Created shopkeeper_dev.');
  }
  await runCommand('npx', ['prisma', 'generate', '--schema=packages/db/prisma/schema.prisma'], { env, cwd: REPO_ROOT });
  await runCommand('npx', ['prisma', 'migrate', 'deploy', '--schema=packages/db/prisma/schema.prisma'], { env, cwd: REPO_ROOT });
  await runCommand('npx', ['turbo', 'run', 'build', '--filter=./packages/*'], { env, cwd: REPO_ROOT });
  console.log('[dev:setup] Database ready. Run npm run dev:doctor, then npm run dev.');
  console.log('[dev:setup] After signing in and connecting the demo store, npm run demo:seed adds sample inbox data.');
}

async function doctor(startup) {
  let failures = 0;
  const report = (ok, label) => {
    console.log(`[${ok ? 'ok' : 'fail'}] ${label}`);
    if (!ok) failures++;
  };
  report(process.versions.node.split('.')[0] === '22', `Node ${process.versions.node} (requires 22.x)`);
  const npm = spawnSync('npm', ['--version'], { encoding: 'utf8' });
  report(npm.status === 0 && npm.stdout.trim().startsWith('10.'), 'npm 10.x');
  const env = getDevEnv();
  try { assertLocalDevEnv(env); } catch (error) {
    report(false, error.message);
    return failures;
  }
  for (const key of ['CLERK_SECRET_KEY', 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'ANTHROPIC_API_KEY', 'INTERNAL_API_SECRET', 'TOKEN_ENCRYPTION_KEY', 'OAUTH_ATTEMPT_SECRET']) {
    report(usable(env[key]), `${key} configured (value hidden)`);
  }
  report(env.CLERK_SECRET_KEY?.startsWith('sk_test_') && env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith('pk_test_'), 'Clerk development instance selected');
  report(/^[a-f\d]{64}$/i.test(env.TOKEN_ENCRYPTION_KEY ?? ''), 'Token encryption key has the required format');
  report((env.OAUTH_ATTEMPT_SECRET?.length ?? 0) >= 32, 'OAuth signing secret has at least 32 characters');
  if (!usable(env.UPSTASH_REDIS_REST_URL) || !usable(env.UPSTASH_REDIS_REST_TOKEN)) {
    console.log('[warn] Configure a development Upstash REST instance for dashboard locks/caching; gateway TCP Redis is separate.');
  }
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient({ datasources: { db: { url: env.DIRECT_DATABASE_URL } } });
  try {
    await prisma.$queryRaw`SELECT 1`;
    report(true, 'PostgreSQL shopkeeper_dev reachable');
    const applied = await prisma.$queryRaw`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
    const names = new Set(applied.map(row => row.migration_name));
    const pending = readdirSync(path.join(REPO_ROOT, 'packages/db/prisma/migrations'), { withFileTypes: true }).filter(entry => entry.isDirectory() && !names.has(entry.name));
    report(pending.length === 0, pending.length ? `${pending.length} migrations pending; run npm run dev:setup` : 'Development schema up to date');
  } catch {
    report(false, 'Development database unavailable or unmigrated; run npm run dev:setup');
  } finally { await prisma.$disconnect(); }

  // Resolve the gateway's declared dependency without adding another root dependency.
  const { createRequire } = await import('node:module');
  const requireGateway = createRequire(path.join(REPO_ROOT, 'apps/gateway/package.json'));
  const Redis = requireGateway('ioredis');
  const redis = new Redis(env.REDIS_URL, { lazyConnect: true, connectTimeout: 2000, maxRetriesPerRequest: 0, retryStrategy: () => null });
  redis.on('error', () => {});
  try {
    await redis.connect();
    report(await redis.ping() === 'PONG', 'Gateway Redis database /1 reachable (tests use /0)');
  } catch { report(false, 'Gateway Redis unavailable; run npm run dev:setup'); }
  finally { redis.disconnect(); }

  if (!startup) {
    for (const [label, url] of [['Dashboard', `${env.DASHBOARD_INTERNAL_URL}/api/health/deep`], ['Gateway and worker', `${env.GATEWAY_INTERNAL_URL}/health/deep`]]) {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
        report(response.ok, `${label} health HTTP ${response.status}`);
      } catch (error) {
        if (error.cause?.code === 'ECONNREFUSED') console.log(`[info] ${label} not running; start with npm run dev.`);
        else report(false, `${label} health request failed or timed out`);
      }
    }
  }
  return failures;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const action = process.argv[2];
    if (action === 'setup') await setup();
    else if (action === 'doctor') process.exitCode = await doctor(process.argv.includes('--startup')) ? 1 : 0;
    else throw new Error('Use npm run dev:setup or npm run dev:doctor.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

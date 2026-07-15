import net from 'node:net';
import { rm } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import { getTestEnv } from './with-test-env.mjs';

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_INTERVAL_MS = 250;

export function resolveTestEnv(baseEnv = process.env) {
  return getTestEnv(baseEnv);
}

export function getTestServiceTargets(baseEnv = process.env) {
  const env = resolveTestEnv(baseEnv);
  return {
    postgres: parseTcpTarget('Postgres', env.DATABASE_URL),
    redis: parseTcpTarget('Redis', env.REDIS_URL),
  };
}

function parseTcpTarget(label, connectionString) {
  const url = new URL(connectionString);
  return {
    label,
    host: url.hostname,
    port: Number(url.port || defaultPortForProtocol(url.protocol)),
  };
}

function defaultPortForProtocol(protocol) {
  if (protocol.startsWith('postgres')) return 5432;
  if (protocol.startsWith('redis')) return 6379;
  throw new Error(`[test-infra] Unsupported protocol: ${protocol}`);
}

export async function waitForTcpService(target, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      await tryConnect(target.host, target.port);
      return;
    } catch (error) {
      lastError = error;
      await sleep(intervalMs);
    }
  }

  const suffix = lastError instanceof Error ? ` Last error: ${lastError.message}` : '';
  throw new Error(`[test-infra] ${target.label} is not reachable on ${target.host}:${target.port}.${suffix}`);
}

export async function waitForAllTestServices(baseEnv = process.env, options = {}) {
  const targets = getTestServiceTargets(baseEnv);
  await Promise.all([
    waitForTcpService(targets.postgres, options),
    waitForTcpService(targets.redis, options),
  ]);
}

export async function resetTestData(baseEnv = process.env) {
  const env = resolveTestEnv(baseEnv);
  assertTestDatabase(env);

  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient({
    datasources: {
      db: { url: env.DATABASE_URL },
    },
  });

  try {
    const tables = await prisma.$queryRaw`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename <> '_prisma_migrations'
    `;

    if (!Array.isArray(tables) || tables.length === 0) {
      return;
    }

    const quotedTables = tables
      .map((row) => quoteIdentifier(row.tablename))
      .join(', ');
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${quotedTables} RESTART IDENTITY CASCADE`);
  } finally {
    await prisma.$disconnect();
  }
}

export async function seedE2ETestData(baseEnv = process.env) {
  const env = resolveTestEnv(baseEnv);
  assertTestDatabase(env);

  const { PrismaClient, ChannelType, EmailProvider } = await import('@prisma/client');
  const prisma = new PrismaClient({
    datasources: {
      db: { url: env.DATABASE_URL },
    },
  });

  try {
    const org = await prisma.organization.upsert({
      where: { clerkOrgId: env.E2E_CLERK_ORG_ID },
      create: {
        clerkOrgId: env.E2E_CLERK_ORG_ID,
        name: env.E2E_TEST_ORG_NAME,
        settings: {
          autoPlanOnOpen: false,
          spamFilterEnabled: false,
          onboardingCompletedAt: '2020-01-01T00:00:00.000Z',
        },
      },
      update: {
        name: env.E2E_TEST_ORG_NAME,
        settings: {
          autoPlanOnOpen: false,
          spamFilterEnabled: false,
          onboardingCompletedAt: '2020-01-01T00:00:00.000Z',
        },
      },
    });

    await prisma.orgMember.upsert({
      where: {
        organizationId_clerkUserId: {
          organizationId: org.id,
          clerkUserId: env.E2E_CLERK_USER_ID,
        },
      },
      create: {
        organizationId: org.id,
        clerkUserId: env.E2E_CLERK_USER_ID,
      },
      update: {},
    });

    await prisma.integration.upsert({
      where: {
        organizationId_emailProvider: {
          organizationId: org.id,
          emailProvider: EmailProvider.postmark,
        },
      },
      create: {
        organizationId: org.id,
        platform: ChannelType.email,
        emailProvider: EmailProvider.postmark,
        externalAccountId: env.E2E_TEST_EMAIL_ADDRESS,
        fromEmail: env.E2E_TEST_EMAIL_ADDRESS,
      },
      update: {
        externalAccountId: env.E2E_TEST_EMAIL_ADDRESS,
        fromEmail: env.E2E_TEST_EMAIL_ADDRESS,
      },
    });

    console.log(`[test-infra] Seeded E2E organization ${org.clerkOrgId} (${org.id})`);
  } finally {
    await prisma.$disconnect();
  }
}

export async function clearOutboundRecords(baseEnv = process.env) {
  const env = resolveTestEnv(baseEnv);
  if (!env.E2E_OUTBOUND_RECORD_PATH) {
    return;
  }

  await rm(env.E2E_OUTBOUND_RECORD_PATH, { force: true });
}

export function detectDockerCompose() {
  const modern = spawnSync('docker', ['compose', 'version'], { stdio: 'ignore' });
  if (modern.status === 0) {
    return { command: 'docker', baseArgs: ['compose'] };
  }

  const legacy = spawnSync('docker-compose', ['version'], { stdio: 'ignore' });
  if (legacy.status === 0) {
    return { command: 'docker-compose', baseArgs: [] };
  }

  throw new Error('[test-infra] Docker Compose is not available. Install Docker Desktop or docker-compose.');
}

export function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: options.stdio ?? 'inherit',
      env: options.env ?? resolveTestEnv(process.env),
      cwd: options.cwd ?? process.cwd(),
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`[test-infra] ${command} ${args.join(' ')} exited with code ${code ?? 1}`));
    });
  });
}

function assertTestDatabase(env) {
  if (env.NODE_ENV !== 'test') {
    throw new Error('[test-infra] Refusing to reset or seed data outside NODE_ENV=test');
  }

  const databaseUrl = new URL(env.DATABASE_URL);
  if (databaseUrl.pathname !== '/clerk_test') {
    throw new Error(`[test-infra] Refusing to reset non-test database: ${databaseUrl.pathname}`);
  }
}

function quoteIdentifier(identifier) {
  return `"${String(identifier).replaceAll('"', '""')}"`;
}

function tryConnect(host, port) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port });

    socket.once('connect', () => {
      socket.end();
      resolve();
    });

    socket.once('error', (error) => {
      socket.destroy();
      reject(error);
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

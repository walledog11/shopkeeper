import { randomUUID } from 'node:crypto';
import { db } from '@shopkeeper/db';
import { getEmailProvider, getGmailMetadata } from '@shopkeeper/email';
import { closeGatewayBullMqQueues, getGatewayBullMqQueue } from '../apps/gateway/src/clients/gateway-queues.js';
import { closeGatewayRedisConnections } from '../apps/gateway/src/clients/redis-client.js';
import { loadGatewayEnv } from '../apps/gateway/src/config/load-env.js';
import { JOB, QUEUE } from '../apps/gateway/src/constants.js';
import type { GmailSyncJobData } from '../apps/gateway/src/types.js';

const DEFAULT_MAX_MESSAGES = 10_000;
const MAX_MESSAGES = 50_000;
const DEFAULT_QUERY = 'newer_than:30d in:inbox';

loadGatewayEnv();

function readArg(prefix: string): string | null {
  const value = process.argv.find((arg) => arg.startsWith(prefix))
    ?.slice(prefix.length)
    .trim();
  return value || null;
}

function usage(): never {
  throw new Error(
    'Usage: npm run recover:gmail-history -- --integration-id=<uuid> '
    + '[--max-messages=10000] [--query=\"newer_than:30d in:inbox\"] '
    + '[--recovery-id=<incident-id> --execute]',
  );
}

async function main(): Promise<void> {
  const integrationId = readArg('--integration-id=');
  if (!integrationId) usage();

  const parsedMax = Number(readArg('--max-messages=') ?? DEFAULT_MAX_MESSAGES);
  const query = readArg('--query=') ?? DEFAULT_QUERY;
  const execute = process.argv.includes('--execute');
  const recoveryId = readArg('--recovery-id=');
  if (
    !Number.isInteger(parsedMax)
    || parsedMax < 1
    || parsedMax > MAX_MESSAGES
    || query.length > 256
  ) {
    usage();
  }
  if (execute && (!recoveryId || !/^[A-Za-z0-9._-]{1,80}$/.test(recoveryId))) {
    usage();
  }

  const integration = await db.integration.findUnique({
    where: { id: integrationId },
    select: {
      id: true,
      emailProvider: true,
      metadata: true,
      organizationId: true,
      platform: true,
      refreshToken: true,
    },
  });
  const gmail = getGmailMetadata(integration?.metadata);
  if (
    !integration
    || integration.platform !== 'email'
    || getEmailProvider(integration) !== 'gmail'
    || !integration.refreshToken
  ) {
    throw new Error('The target is not a connected Gmail integration');
  }

  const preflight = {
    execute,
    integrationId: integration.id,
    organizationId: integration.organizationId,
    inboundStatus: gmail?.inboundStatus ?? null,
    lastError: gmail?.lastError ?? null,
    maxMessages: parsedMax,
    query,
  };
  console.log(JSON.stringify(preflight, null, 2));

  if (!execute) {
    console.log(
      'Inspect-only. Execute only for sync_recovery_truncated, using a stable incident recovery ID.',
    );
    return;
  }
  if (
    gmail?.inboundStatus !== 'degraded'
    || gmail.lastError !== 'sync_recovery_truncated'
  ) {
    throw new Error(
      'Execute mode requires inboundStatus=degraded and lastError=sync_recovery_truncated',
    );
  }

  const queue = getGatewayBullMqQueue(QUEUE.GMAIL_SYNC);
  const data: GmailSyncJobData = {
    integrationId: integration.id,
    source: 'operator_recovery',
    recoveryMaxMessages: parsedMax,
    recoveryQuery: query,
    traceId: randomUUID(),
  };
  const jobId = `gmail-sync-operator-recovery-${integration.id}-${recoveryId}`;
  const job = await queue.add(JOB.GMAIL_SYNC, data, { jobId });
  console.log(JSON.stringify({ enqueued: true, jobId: job.id }, null, 2));
}

async function run(): Promise<void> {
  try {
    await main();
  } finally {
    await Promise.all([
      closeGatewayBullMqQueues().catch(() => {}),
      closeGatewayRedisConnections().catch(() => {}),
      db.$disconnect().catch(() => {}),
    ]);
  }
}

void run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

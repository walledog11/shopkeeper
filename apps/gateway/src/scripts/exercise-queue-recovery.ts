import { randomUUID } from 'node:crypto';
import { Queue } from 'bullmq';
import { Redis as IORedis } from 'ioredis';
import {
  CONTROLLED_QUEUE_RECOVERY_FAILURE,
  JOB,
  PROCESSING_QUEUE_DEFAULTS,
  QUEUE,
} from '../constants.js';
import { toGatewayBullMqConnection } from '../clients/redis-client.js';
import { loadGatewayEnv } from '../config/load-env.js';

const JOB_ID_PREFIX = 'queue-recovery-canary-';
const CANARY_ORDER_ID = 'controlled-recovery-canary';
const NIL_ORGANIZATION_ID = '00000000-0000-0000-0000-000000000000';
const POLL_INTERVAL_MS = 250;
const POLL_TIMEOUT_MS = 30_000;

type Command = 'stage' | 'recover' | 'cleanup';

loadGatewayEnv();

function usage(): never {
  throw new Error(
    'Usage: npm run recovery:queue -w apps/gateway -- <stage|recover|cleanup> [jobId] --execute',
  );
}

function readCommand(): { command: Command; jobId: string | null; execute: boolean } {
  const args = process.argv.slice(2);
  const command = args.find((arg): arg is Command =>
    arg === 'stage' || arg === 'recover' || arg === 'cleanup');
  if (!command) usage();

  const jobId = args.find((arg) => arg.startsWith(JOB_ID_PREFIX)) ?? null;
  if (command !== 'stage' && !jobId) usage();

  return { command, jobId, execute: args.includes('--execute') };
}

function getRedisUrl(): string {
  const raw = process.env.REDIS_PUBLIC_URL || process.env.REDIS_URL;
  if (!raw) {
    throw new Error('REDIS_PUBLIC_URL or REDIS_URL is required');
  }
  return raw;
}

function print(value: Record<string, unknown>): void {
  console.log(JSON.stringify(value, null, 2));
}

async function waitForState(
  queue: Queue,
  jobId: string,
  expectedState: 'failed' | 'completed',
): Promise<NonNullable<Awaited<ReturnType<Queue['getJob']>>>> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const job = await queue.getJob(jobId);
    if (!job) throw new Error(`Recovery canary disappeared: ${jobId}`);
    if (await job.getState() === expectedState) return job;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error(`Timed out waiting for ${jobId} to reach ${expectedState}`);
}

function assertCanary(job: NonNullable<Awaited<ReturnType<Queue['getJob']>>>): void {
  if (
    !String(job.id).startsWith(JOB_ID_PREFIX)
    || job.name !== JOB.CONTROLLED_QUEUE_RECOVERY
    || job.data?.organizationId !== NIL_ORGANIZATION_ID
    || job.data?.orderId !== CANARY_ORDER_ID
  ) {
    throw new Error(`Refusing non-canary job: ${String(job.id)}`);
  }
}

async function stage(queue: Queue): Promise<void> {
  const traceId = randomUUID();
  const jobId = `${JOB_ID_PREFIX}${traceId}`;
  await queue.add(
    JOB.CONTROLLED_QUEUE_RECOVERY,
    {
      organizationId: NIL_ORGANIZATION_ID,
      orderId: CANARY_ORDER_ID,
      traceId,
    },
    {
      jobId,
      attempts: 1,
      removeOnComplete: PROCESSING_QUEUE_DEFAULTS.removeOnComplete,
      removeOnFail: PROCESSING_QUEUE_DEFAULTS.removeOnFail,
    },
  );

  const failed = await waitForState(queue, jobId, 'failed');
  assertCanary(failed);
  if (failed.failedReason !== CONTROLLED_QUEUE_RECOVERY_FAILURE || failed.attemptsMade !== 1) {
    throw new Error(
      `Unexpected canary failure state: reason=${failed.failedReason} attempts=${failed.attemptsMade}`,
    );
  }

  print({
    action: 'staged',
    queue: QUEUE.ORDER_REVIEW,
    jobId,
    state: 'failed',
    attemptsMade: failed.attemptsMade,
    failedReason: failed.failedReason,
    traceId,
  });
}

async function recover(queue: Queue, jobId: string): Promise<void> {
  const job = await queue.getJob(jobId);
  if (!job) throw new Error(`Recovery canary not found: ${jobId}`);
  assertCanary(job);
  if (await job.getState() !== 'failed') {
    throw new Error(`Recovery canary is not failed: ${jobId}`);
  }
  if (job.failedReason !== CONTROLLED_QUEUE_RECOVERY_FAILURE || job.attemptsMade !== 1) {
    throw new Error(`Recovery canary does not have the expected one-failure evidence: ${jobId}`);
  }

  await job.retry('failed');
  const completed = await waitForState(queue, jobId, 'completed');
  assertCanary(completed);

  print({
    action: 'recovered',
    queue: QUEUE.ORDER_REVIEW,
    jobId,
    state: 'completed',
    attemptsMade: completed.attemptsMade,
    traceId: completed.data.traceId,
  });
}

async function cleanup(queue: Queue, jobId: string): Promise<void> {
  const job = await queue.getJob(jobId);
  if (!job) throw new Error(`Recovery canary not found: ${jobId}`);
  assertCanary(job);
  if (await job.getState() !== 'completed') {
    throw new Error(`Refusing to remove non-completed recovery canary: ${jobId}`);
  }
  await job.remove();
  print({ action: 'cleaned', queue: QUEUE.ORDER_REVIEW, jobId });
}

async function main(): Promise<void> {
  const { command, jobId, execute } = readCommand();
  if (!execute) {
    print({
      mode: 'inspect-only',
      command,
      jobId,
      next: 'Re-run with --execute after confirming the production worker is healthy.',
    });
    return;
  }

  const connection = new IORedis(getRedisUrl(), {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
  const queue = new Queue(QUEUE.ORDER_REVIEW, {
    connection: toGatewayBullMqConnection(connection),
  });
  try {
    if (command === 'stage') {
      await stage(queue);
    } else if (command === 'recover') {
      await recover(queue, jobId!);
    } else {
      await cleanup(queue, jobId!);
    }
  } finally {
    await queue.close();
    await connection.quit().catch(() => connection.disconnect());
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

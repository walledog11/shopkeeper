import { Queue } from 'bullmq';
import { closeGatewayBullMqQueues } from '../clients/gateway-queues.js';
import { closeGatewayRedisConnections, getGatewayBullMqProducerConnection } from '../clients/redis-client.js';
import { loadGatewayEnv } from '../config/load-env.js';

loadGatewayEnv();

const LEGACY_QUEUES = ['customer-memory', 'customer-memory-refresh'] as const;
const LEGACY_REPEATABLE_JOB_ID = 'customer-memory-stale-refresh-daily';

interface QueueSnapshot {
  queueName: string;
  counts: Awaited<ReturnType<Queue['getJobCounts']>>;
  repeatableJobs: Awaited<ReturnType<Queue['getRepeatableJobs']>>;
}

async function snapshotQueue(queueName: string): Promise<QueueSnapshot> {
  const queue = new Queue(queueName, { connection: getGatewayBullMqProducerConnection() });
  try {
    const [counts, repeatableJobs] = await Promise.all([
      queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed', 'paused'),
      queue.getRepeatableJobs(),
    ]);
    return { queueName, counts, repeatableJobs };
  } finally {
    await queue.close();
  }
}

async function drainQueue(queueName: string): Promise<void> {
  const queue = new Queue(queueName, { connection: getGatewayBullMqProducerConnection() });
  try {
    const repeatableJobs = await queue.getRepeatableJobs();
    for (const job of repeatableJobs) {
      if (job.id === LEGACY_REPEATABLE_JOB_ID || job.name === 'refresh-stale-customer-memory') {
        await queue.removeRepeatableByKey(job.key);
      }
    }

    await queue.obliterate({ force: true });
  } finally {
    await queue.close();
  }
}

async function main(): Promise<void> {
  const execute = process.argv.includes('--execute');

  const before = await Promise.all(LEGACY_QUEUES.map(snapshotQueue));
  console.log(JSON.stringify({ mode: execute ? 'execute' : 'dry-run', before }, null, 2));

  if (!execute) {
    console.log('Dry run only. Re-run with --execute to remove repeatable jobs and obliterate legacy queues.');
    return;
  }

  for (const queueName of LEGACY_QUEUES) {
    await drainQueue(queueName);
  }

  const after = await Promise.all(LEGACY_QUEUES.map(snapshotQueue));
  console.log(JSON.stringify({ mode: 'execute', after }, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await closeGatewayBullMqQueues();
    await closeGatewayRedisConnections();
  });

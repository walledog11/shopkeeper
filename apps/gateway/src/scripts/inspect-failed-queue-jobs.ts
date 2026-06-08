import { Queue } from 'bullmq';
import { createGatewayRedisClient, toGatewayBullMqConnection } from '../clients/redis-client.js';
import { loadGatewayEnv } from '../config/load-env.js';
import { readFailedQueueJobSnapshots } from '../health.js';

loadGatewayEnv();

async function main(): Promise<void> {
  const queueArg = process.argv[2];
  if (!queueArg?.trim()) {
    throw new Error('Usage: npx tsx src/scripts/inspect-failed-queue-jobs.ts <inbound|ai-summary>');
  }

  const { resolveQueueName } = await import('../queue-maintenance.js');
  const queueName = resolveQueueName(queueArg);
  const redis = createGatewayRedisClient();
  const queue = new Queue(queueName, { connection: toGatewayBullMqConnection(redis) });

  try {
    const counts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed', 'paused');
    const failedJobs = await readFailedQueueJobSnapshots(queue, counts.failed ?? 0, 20);

    console.log(JSON.stringify({ queueName, counts, failedJobs }, null, 2));
  } finally {
    await queue.close();
    await redis.quit().catch(() => redis.disconnect());
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

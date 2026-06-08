import { Queue } from 'bullmq';
import { createGatewayRedisClient, toGatewayBullMqConnection } from '../clients/redis-client.js';
import { loadGatewayEnv } from '../config/load-env.js';
import { QUEUE } from '../constants.js';
import { readFailedQueueJobSnapshots } from '../health.js';

loadGatewayEnv();

const QUEUE_ALIASES: Record<string, string> = {
  inbound: QUEUE.INBOUND,
  'inbound-messages': QUEUE.INBOUND,
  aiSummary: QUEUE.AI_SUMMARY,
  'ai-summary': QUEUE.AI_SUMMARY,
};

function resolveQueueName(raw: string | undefined): string {
  const value = raw?.trim();
  if (!value) {
    throw new Error('Usage: npx tsx src/scripts/inspect-failed-queue-jobs.ts <inbound|ai-summary>');
  }

  return QUEUE_ALIASES[value] ?? value;
}

async function main(): Promise<void> {
  const queueName = resolveQueueName(process.argv[2]);
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

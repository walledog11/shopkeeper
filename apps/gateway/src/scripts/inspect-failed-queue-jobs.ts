import { closeGatewayBullMqQueues, getGatewayBullMqQueue } from '../clients/gateway-queues.js';
import { closeGatewayRedisConnections } from '../clients/redis-client.js';
import { loadGatewayEnv } from '../config/load-env.js';
import { readFailedQueueJobSnapshots } from '../health.js';

loadGatewayEnv();

async function main(): Promise<void> {
  const queueArg = process.argv[2];
  if (!queueArg?.trim()) {
    throw new Error('Usage: npx tsx src/scripts/inspect-failed-queue-jobs.ts <inbound|ai-summary>');
  }

  const queue = getGatewayBullMqQueue(queueArg);

  try {
    const counts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed', 'paused');
    const failedJobs = await readFailedQueueJobSnapshots(queue, counts.failed ?? 0, 20);

    console.log(JSON.stringify({ queueName: queue.name, counts, failedJobs }, null, 2));
  } finally {
    await closeGatewayBullMqQueues();
    await closeGatewayRedisConnections();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

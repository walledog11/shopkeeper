import { closeGatewayBullMqQueues } from '../clients/gateway-queues.js';
import { closeGatewayRedisConnections } from '../clients/redis-client.js';
import { loadGatewayEnv } from '../config/load-env.js';
import { clearQueueDiagnosticsCache } from '../health.js';
import { removeFailedQueueJob } from '../queue-maintenance.js';

loadGatewayEnv();

async function main(): Promise<void> {
  const queue = process.argv[2];
  const jobId = process.argv[3];
  if (!queue || !jobId) {
    throw new Error('Usage: npx tsx src/scripts/remove-failed-queue-job.ts <inbound|ai-summary> <jobId>');
  }

  try {
    const removed = await removeFailedQueueJob(queue, jobId);
    if (!removed) {
      console.error(`Failed job not found: queue=${queue} jobId=${jobId}`);
      process.exitCode = 1;
      return;
    }

    clearQueueDiagnosticsCache();
    console.log(JSON.stringify({ removed: true, queue, jobId }));
  } finally {
    await closeGatewayBullMqQueues();
    await closeGatewayRedisConnections();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
